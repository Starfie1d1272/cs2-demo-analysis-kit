import { useEffect, useState } from 'react';
import { SPATIAL_ASSET_MAPS } from '@cs2dak/maps';
import { mapDisplayName } from '../../lib/series';
import type { CoachMatchSheetDraft } from '../../lib/coach-match-sheet';
import type { SheetMaterialRef } from '../../lib/material-ref';
import {
  listStudyMaterials,
  materialKey,
  type MaterialSummary,
  type MaterialKind,
} from '../../lib/study-materials';
import type { StudioDemoEntry } from '../../lib/demo-entry';

export function MatchSheetEditor({
  draft,
  entries,
  onChange,
}: {
  draft: CoachMatchSheetDraft;
  entries: StudioDemoEntry[];
  onChange: (draft: CoachMatchSheetDraft) => void;
}) {
  const [rows, setRows] = useState<MaterialSummary[]>([]);
  const [search, setSearch] = useState('');
  const [mapFilter, setMapFilter] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState<Partial<Record<MaterialKind, boolean>>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void listStudyMaterials(entries).then((r) => {
      if (live) {
        setRows(r.rows);
        setError(Object.values(r.errors).join('；'));
        setUnavailable(
          Object.fromEntries(
            Object.keys({
              ...r.errors,
              ...Object.fromEntries(Object.entries(r.unreadableByKind).filter(([, n]) => n > 0)),
            }).map((kind) => [kind, true]),
          ),
        );
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [entries]);
  const updateSection = (index: number, patch: Partial<CoachMatchSheetDraft['sections'][number]>) =>
    onChange({
      ...draft,
      sections: draft.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  return (
    <div>
      <label>
        标题{' '}
        <input
          className="stu-input"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
      </label>
      <label>
        对手{' '}
        <input
          className="stu-input"
          value={draft.opponentLabel}
          onChange={(e) => onChange({ ...draft, opponentLabel: e.target.value })}
        />
      </label>
      <label>
        地图{' '}
        <select
          className="stu-input"
          value={draft.mapName ?? ''}
          onChange={(e) => onChange({ ...draft, mapName: e.target.value || null })}
        >
          <option value="">多图</option>
          {draft.mapName && !SPATIAL_ASSET_MAPS.some((map) => map === draft.mapName) && (
            <option value={draft.mapName}>{mapDisplayName(draft.mapName)}</option>
          )}
          {SPATIAL_ASSET_MAPS.map((map) => (
            <option key={map} value={map}>
              {mapDisplayName(map)}
            </option>
          ))}
        </select>
      </label>
      <label>
        搜索材料{' '}
        <input className="stu-input" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {draft.mapName && (
        <label>
          <input
            type="checkbox"
            checked={mapFilter}
            onChange={(e) => setMapFilter(e.target.checked)}
          />
          仅显示此地图
        </label>
      )}
      {error && <p role="alert">部分材料读取失败：{error}</p>}
      {draft.sections.map((section, i) => (
        <section key={section.id}>
          <h2>段落 {i + 1}</h2>
          <label>
            标题{' '}
            <input
              className="stu-input"
              value={section.heading}
              onChange={(e) => updateSection(i, { heading: e.target.value })}
            />
          </label>
          <label>
            备注{' '}
            <textarea
              className="stu-input"
              value={section.notes}
              onChange={(e) => updateSection(i, { notes: e.target.value })}
            />
          </label>
          {section.refs.map((ref, j) => {
            const row = rows.find((r) => materialKey(r.ref) === materialKey(ref));
            return (
              <div key={materialKey(ref)}>
                {row?.title ??
                  (loading
                    ? '正在读取材料…'
                    : unavailable[ref.kind]
                      ? `材料无法读取 ${ref.kind}:${ref.id}`
                      : `材料已删除 ${ref.kind}:${ref.id}`)}{' '}
                <button
                  className="stu-button-sm"
                  disabled={j === 0}
                  onClick={() => {
                    const refs = [...section.refs];
                    [refs[j - 1], refs[j]] = [refs[j], refs[j - 1]];
                    updateSection(i, { refs });
                  }}
                >
                  上移
                </button>
                <button
                  className="stu-button-sm"
                  disabled={j === section.refs.length - 1}
                  onClick={() => {
                    const refs = [...section.refs];
                    [refs[j + 1], refs[j]] = [refs[j], refs[j + 1]];
                    updateSection(i, { refs });
                  }}
                >
                  下移
                </button>
                <button
                  className="stu-button-sm"
                  onClick={() =>
                    updateSection(i, {
                      refs: section.refs.filter((_, k) => k !== j),
                    })
                  }
                >
                  移除
                </button>
              </div>
            );
          })}
          <select
            aria-label="添加材料"
            className="stu-input"
            value=""
            onChange={(e) => {
              const row = rows.find((r) => materialKey(r.ref) === e.target.value);
              if (row && row.ref.kind !== 'match-sheet')
                updateSection(i, {
                  refs: [...section.refs, row.ref as SheetMaterialRef],
                });
            }}
          >
            <option value="">添加材料</option>
            {rows
              .filter(
                (r) =>
                  r.ref.kind !== 'match-sheet' &&
                  (!mapFilter || r.mapName === draft.mapName) &&
                  !section.refs.some((ref) => materialKey(ref) === materialKey(r.ref)) &&
                  `${r.title} ${r.summary}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((r) => (
                <option key={materialKey(r.ref)} value={materialKey(r.ref)}>
                  {r.kindLabel} · {r.title} · {r.mapName ?? '—'}
                </option>
              ))}
          </select>
          <button
            className="stu-button-sm"
            onClick={() =>
              onChange({
                ...draft,
                sections: draft.sections.filter((_, k) => k !== i),
              })
            }
          >
            删除段落
          </button>
        </section>
      ))}
      <button
        className="stu-button-sm"
        onClick={() =>
          onChange({
            ...draft,
            sections: [
              ...draft.sections,
              { id: crypto.randomUUID(), heading: '重点', notes: '', refs: [] },
            ],
          })
        }
      >
        添加段落
      </button>
    </div>
  );
}
