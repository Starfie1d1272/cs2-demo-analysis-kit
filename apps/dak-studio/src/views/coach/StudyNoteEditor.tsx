import type { StudioDemoEntry } from '../../lib/demo-entry';
import type { StudyNoteDraft } from '../../lib/study-notes';
import { SavedEvidenceEditor } from './SavedEvidenceEditor';

export function StudyNoteEditor({
  draft,
  entries,
  onChange,
  onEvidence,
}: {
  draft: StudyNoteDraft;
  entries: StudioDemoEntry[];
  onChange: (draft: StudyNoteDraft) => void;
  onEvidence: (index: number) => void;
}) {
  const update = (patch: Partial<StudyNoteDraft>) => onChange({ ...draft, ...patch });
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
        正文
        <textarea
          className="stu-input"
          value={draft.body}
          onChange={(e) => update({ body: e.target.value })}
        />
      </label>
      <label>
        用途
        <select
          className="stu-input"
          value={draft.purpose}
          onChange={(e) => update({ purpose: e.target.value as StudyNoteDraft['purpose'] })}
        >
          <option value="review">复盘</option>
          <option value="practice">练习</option>
        </select>
      </label>
      <label>
        选手标识
        <input
          className="stu-input"
          value={draft.playerKey ?? ''}
          onChange={(e) => update({ playerKey: e.target.value || null })}
        />
      </label>
      <SavedEvidenceEditor
        value={draft.evidence}
        entries={entries}
        onChange={(evidence) => update({ evidence })}
        onEvidence={onEvidence}
      />
    </div>
  );
}
