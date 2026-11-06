import { useState } from 'react';
import { getMapCalibration, hasLowerLevel } from '@cs2dak/maps/calibration';
import type { MapAnnotationView, MapView } from '@cs2dak/presentation';

export interface MapAnnotationCanvasProps {
  map: MapView;
  level: 'upper' | 'lower';
  markers: MapAnnotationView[];
  selectedMarkerId: string | null;
  onPointSelect?: (point: { u: number; v: number; level: 'upper' | 'lower' }) => void;
  onMarkerSelect?: (id: string) => void;
}
const kindLabels: Record<MapAnnotationView['kind'], string> = {
  position: '位置',
  smoke: '烟雾',
  flash: '闪光',
  fire: '燃烧弹',
  note: '备注',
};
const levelLabels: Record<MapAnnotationView['level'], string> = { upper: '上层', lower: '下层' };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function MapAnnotationCanvas({
  map,
  level,
  markers,
  selectedMarkerId,
  onPointSelect,
  onMarkerSelect,
}: MapAnnotationCanvasProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const calibration = getMapCalibration(map.name);
  const lowerAvailable = !!(calibration && hasLowerLevel(calibration) && map.lowerRadarImageUrl);
  const url =
    level === 'lower' ? (lowerAvailable ? map.lowerRadarImageUrl : null) : map.radarImageUrl;
  const available = !!url && failedUrl !== url;
  return (
    <div>
      {available ? (
        <div style={{ position: 'relative', width: '100%', maxWidth: 640, lineHeight: 0 }}>
          <img
            src={url!}
            alt={`${map.name} ${levelLabels[level]}雷达图`}
            draggable={false}
            onError={() => setFailedUrl(url!)}
            style={{ display: 'block', width: '100%', height: 'auto' }}
            onClick={(event) => {
              if (!onPointSelect) return;
              const rect = event.currentTarget.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const u = (event.clientX - rect.left) / rect.width,
                v = (event.clientY - rect.top) / rect.height;
              if (Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 1 && v >= 0 && v <= 1)
                onPointSelect({ u: clamp(u), v: clamp(v), level });
            }}
          />
          {markers
            .filter((m) => m.level === level && Number.isFinite(m.u) && Number.isFinite(m.v))
            .map((m) => {
              const position = {
                position: 'absolute' as const,
                left: `${clamp(m.u) * 100}%`,
                top: `${clamp(m.v) * 100}%`,
                transform: 'translate(-50%, -50%)',
              };
              const text = m.label || kindLabels[m.kind];
              return onMarkerSelect ? (
                <button
                  type="button"
                  className="dak-map-marker"
                  key={m.id}
                  aria-label={`${kindLabels[m.kind]} ${m.label || '未命名'}`}
                  aria-pressed={m.id === selectedMarkerId}
                  onClick={() => onMarkerSelect(m.id)}
                  style={position}
                >
                  {text}
                </button>
              ) : (
                <span className="dak-map-marker" key={m.id} aria-hidden="true" style={position}>
                  {text}
                </span>
              );
            })}
        </div>
      ) : (
        <p>此层地图图片不可用，无法放置标记。</p>
      )}
      <ul aria-label="地图标记列表">
        {markers.map((m) => {
          const text = `${kindLabels[m.kind]} · ${m.label || '未命名'} · ${levelLabels[m.level]}${m.level === 'lower' && !lowerAvailable ? '（下层图片不可用）' : ''}`;
          return (
            <li key={m.id}>
              {onMarkerSelect ? (
                <button
                  className="dak-map-marker-item"
                  type="button"
                  aria-pressed={m.id === selectedMarkerId}
                  onClick={() => onMarkerSelect(m.id)}
                >
                  {text}
                </button>
              ) : (
                <span>{text}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
