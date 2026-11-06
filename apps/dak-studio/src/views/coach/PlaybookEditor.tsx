import { PLAYBOOK_KIND_LABELS } from '../../lib/playbook-labels';
import { PlaybookPhaseEditor } from './PlaybookPhaseEditor';
import { SPATIAL_ASSET_MAPS } from '@cs2dak/maps';
import type { CoachPlaybookDraft } from '../../lib/coach-playbook';
import type { StudioDemoEntry } from '../../lib/demo-entry';
import { SavedEvidenceEditor } from './SavedEvidenceEditor';
export function PlaybookEditor({
  draft,
  entries,
  onChange,
  onEvidence,
  phaseId,
  onPhaseIdChange,
}: {
  phaseId: string | null;
  onPhaseIdChange: (id: string | null) => void;
  draft: CoachPlaybookDraft;
  entries: StudioDemoEntry[];
  onChange: (draft: CoachPlaybookDraft, selectedPhaseId?: string | null) => void;
  onEvidence: (index: number) => void;
}) {
  const update = (patch: Partial<CoachPlaybookDraft>) => onChange({ ...draft, ...patch });
  return (
    <div>
      <label>
        标题
        <input
          className="stu-input"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </label>
      <label>
        地图
        <select
          className="stu-input"
          value={draft.mapName}
          onChange={(e) => update({ mapName: e.target.value })}
        >
          {!SPATIAL_ASSET_MAPS.some((map) => map === draft.mapName) && (
            <option value={draft.mapName}>{draft.mapName}</option>
          )}
          {SPATIAL_ASSET_MAPS.map((map) => (
            <option key={map} value={map}>
              {map}
            </option>
          ))}
        </select>
      </label>
      <label>
        阵营
        <select
          className="stu-input"
          value={draft.side}
          onChange={(e) => update({ side: e.target.value as CoachPlaybookDraft['side'] })}
        >
          <option value="t">T</option>
          <option value="ct">CT</option>
        </select>
      </label>
      <label>
        种类
        <select
          className="stu-input"
          value={draft.kind}
          onChange={(e) => update({ kind: e.target.value as CoachPlaybookDraft['kind'] })}
        >
          {(Object.entries(PLAYBOOK_KIND_LABELS) as [CoachPlaybookDraft['kind'], string][]).map(
            ([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        正文
        <textarea
          className="stu-input"
          value={draft.body}
          onChange={(e) => update({ body: e.target.value })}
        />
      </label>
      <details>
        <summary>补充信息</summary>
        <label>
          目的
          <input
            className="stu-input"
            value={draft.purpose}
            onChange={(e) => update({ purpose: e.target.value })}
          />
        </label>
        <label>
          {draft.kind === 'protocol' ? '触发条件（何时执行协议）' : '触发条件'}
          <input
            className="stu-input"
            value={draft.trigger}
            onChange={(e) => update({ trigger: e.target.value })}
          />
        </label>
        <label>
          标签（逗号分隔）
          <input
            className="stu-input"
            value={draft.tags.join(', ')}
            onChange={(e) => update({ tags: e.target.value.split(',').map((t) => t.trim()) })}
          />
        </label>
      </details>
      <PlaybookPhaseEditor
        draft={draft}
        phaseId={phaseId}
        onPhaseIdChange={onPhaseIdChange}
        onChange={onChange}
      />
      <SavedEvidenceEditor
        value={draft.evidence}
        entries={entries}
        onChange={(evidence) => update({ evidence })}
        onEvidence={onEvidence}
      />
    </div>
  );
}
