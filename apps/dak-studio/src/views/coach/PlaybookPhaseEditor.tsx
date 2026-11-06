import { useEffect, useState } from 'react';
import { getMapCalibration, hasLowerLevel } from '@cs2dak/maps/calibration';
import { MapAnnotationCanvas } from '@cs2dak/react';
import type { CoachMarker, CoachPhase, CoachPlaybookDraft } from '../../lib/coach-playbook';

export function playbookMap(name: string) {
  const calibration = getMapCalibration(name);
  return {
    name,
    calibrated: !!calibration,
    radarImageUrl: calibration ? `./maps/radars/${name}.png` : null,
    lowerRadarImageUrl:
      calibration && hasLowerLevel(calibration) ? `./maps/radars/${name}_lower.png` : null,
  };
}
export function usePlaybookMap(name: string) {
  const candidate = playbookMap(name);
  const [loaded, setLoaded] = useState<{ name: string; upper: boolean; lower: boolean }>({
    name: '',
    upper: false,
    lower: false,
  });
  useEffect(() => {
    let live = true;
    const probe = (url: string | null) =>
      new Promise<boolean>((resolve) => {
        if (!url) return resolve(false);
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = url;
      });
    void Promise.all([probe(candidate.radarImageUrl), probe(candidate.lowerRadarImageUrl)]).then(
      ([upper, lower]) => {
        if (live) setLoaded({ name, upper, lower });
      },
    );
    return () => {
      live = false;
    };
  }, [name]);
  return {
    ...candidate,
    radarImageUrl: loaded.name === name && loaded.upper ? candidate.radarImageUrl : null,
    lowerRadarImageUrl: loaded.name === name && loaded.lower ? candidate.lowerRadarImageUrl : null,
  };
}
export function PlaybookPhaseEditor({
  draft,
  phaseId,
  onPhaseIdChange,
  onChange,
}: {
  draft: CoachPlaybookDraft;
  phaseId: string | null;
  onPhaseIdChange: (id: string | null) => void;
  onChange: (draft: CoachPlaybookDraft, selectedPhaseId?: string | null) => void;
}) {
  const [level, setLevel] = useState<'upper' | 'lower'>('upper');
  const [kind, setKind] = useState<CoachMarker['kind']>('position');
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const phase = draft.phases.find((p) => p.id === phaseId) ?? draft.phases[0];
  const map = usePlaybookMap(draft.mapName);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoving(false);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  useEffect(() => {
    setSelected(null);
    setMoving(false);
  }, [phase?.id]);
  useEffect(() => {
    setLevel('upper');
  }, [draft.mapName]);
  const phases = (items: CoachPhase[]) => onChange({ ...draft, phases: items });
  const update = (patch: Partial<CoachPhase>) => {
    if (phase) phases(draft.phases.map((p) => (p.id === phase.id ? { ...p, ...patch } : p)));
  };
  const reorder = (delta: number) => {
    if (!phase) return;
    const items = [...draft.phases],
      index = items.findIndex((p) => p.id === phase.id),
      next = index + delta;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    onChange({ ...draft, phases: items }, phase.id);
  };
  const marker = phase?.markers.find((m) => m.id === selected);
  return (
    <section>
      <h2>阶段与手工示意</h2>
      <nav aria-label="阶段">
        {draft.phases.map((p) => (
          <button
            type="button"
            className={`stu-chip${phase?.id === p.id ? ' stu-chip-active' : ''}`}
            key={p.id}
            aria-pressed={phase?.id === p.id}
            onClick={() => onPhaseIdChange(p.id)}
          >
            {p.title || '未命名阶段'}
          </button>
        ))}
        <button
          type="button"
          className="stu-button-sm"
          onClick={() => {
            const p: CoachPhase = {
              id: crypto.randomUUID(),
              title: `阶段 ${draft.phases.length + 1}`,
              body: '',
              tasks: [],
              markers: [],
            };
            phases([...draft.phases, p]);
          }}
        >
          新增阶段
        </button>
      </nav>
      {phase && (
        <>
          <label>
            阶段名称
            <input
              className="stu-input"
              value={phase.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <button type="button" className="stu-button-sm" onClick={() => reorder(-1)}>
            上移
          </button>
          <button type="button" className="stu-button-sm" onClick={() => reorder(1)}>
            下移
          </button>
          <button
            type="button"
            className="stu-button-sm"
            onClick={() => {
              if (
                window.confirm(
                  `删除此阶段及 ${phase.tasks.length} 项任务、${phase.markers.length} 个标记？`,
                )
              ) {
                phases(draft.phases.filter((p) => p.id !== phase.id));
              }
            }}
          >
            删除阶段
          </button>
          <label>
            阶段说明
            <textarea
              className="stu-input"
              value={phase.body}
              onChange={(e) => update({ body: e.target.value })}
            />
          </label>
          <h3>人员任务</h3>
          {phase.tasks.map((t) => (
            <div key={t.id}>
              <input
                className="stu-input"
                aria-label="队员"
                value={t.playerLabel}
                onChange={(e) =>
                  update({
                    tasks: phase.tasks.map((x) =>
                      x.id === t.id ? { ...x, playerLabel: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                className="stu-input"
                aria-label="任务"
                value={t.instruction}
                onChange={(e) =>
                  update({
                    tasks: phase.tasks.map((x) =>
                      x.id === t.id ? { ...x, instruction: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="stu-button-sm"
                onClick={() => update({ tasks: phase.tasks.filter((x) => x.id !== t.id) })}
              >
                删除任务
              </button>
            </div>
          ))}
          <button
            type="button"
            className="stu-button-sm"
            onClick={() =>
              update({
                tasks: [
                  ...phase.tasks,
                  { id: crypto.randomUUID(), playerLabel: '', instruction: '' },
                ],
              })
            }
          >
            新增任务
          </button>
          <h3>手工示意</h3>
          {map.lowerRadarImageUrl && (
            <label>
              楼层
              <select
                className="stu-input"
                value={level}
                onChange={(e) => setLevel(e.target.value as typeof level)}
              >
                <option value="upper">上层</option>
                <option value="lower">下层</option>
              </select>
            </label>
          )}
          <label>
            新增标记类型
            <select
              className="stu-input"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {Object.entries({
                position: '位置',
                smoke: '烟雾',
                flash: '闪光',
                fire: '燃烧弹',
                note: '备注',
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p>{moving ? '点击地图移动标记，Esc 取消。' : '点击地图添加标记。'}</p>
          <MapAnnotationCanvas
            map={map}
            level={level}
            markers={phase.markers}
            selectedMarkerId={selected}
            onMarkerSelect={setSelected}
            onPointSelect={(point) => {
              if (moving && marker) {
                update({
                  markers: phase.markers.map((m) => (m.id === marker.id ? { ...m, ...point } : m)),
                });
                setMoving(false);
              } else {
                const m = { id: crypto.randomUUID(), kind, label: '', ...point };
                update({ markers: [...phase.markers, m] });
                setSelected(m.id);
              }
            }}
          />
          {marker && (
            <div>
              <label>
                标记文字
                <input
                  className="stu-input"
                  value={marker.label}
                  onChange={(e) =>
                    update({
                      markers: phase.markers.map((m) =>
                        m.id === marker.id ? { ...m, label: e.target.value } : m,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="stu-button-sm"
                disabled={!map.radarImageUrl}
                onClick={() => setMoving(true)}
              >
                移动此标记
              </button>
              <button
                type="button"
                className="stu-button-sm"
                onClick={() => {
                  update({ markers: phase.markers.filter((m) => m.id !== marker.id) });
                  setSelected(null);
                  setMoving(false);
                }}
              >
                删除标记
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
