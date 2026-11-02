import type { MaterialRef } from "./material-ref";
import type { CoachPlaybookDraft } from "./coach-playbook";
import type { StudyNoteDraft } from "./study-notes";

export type MaterialPageState =
  | { kind: "playbook"; id: string; draft: CoachPlaybookDraft; dirty: boolean; phaseId: string | null }
  | { kind: "study-note"; id: string; draft: StudyNoteDraft; dirty: boolean }
  | { kind: "training-focus"; id: string; draft: { note: string; reviewCondition: string }; dirty: boolean }
  | { kind: "prep-item"; id: string; draft: { group: string; note: string }; dirty: boolean }
  | { kind: "practice-lineup"; id: string; selectedEvidence: number | null };
export interface MaterialsPageState {
  search: string;
  typeFilter: string | null;
  mapFilter: string | null;
  selectedRef: MaterialRef | null;
  newPlaybook: CoachPlaybookDraft | null;
  newPlaybookDirty: boolean;
  newNote: StudyNoteDraft | null;
  newNoteDirty: boolean;
}
export const emptyStudyNoteDraft = (): StudyNoteDraft => ({ title: "", body: "", purpose: "review", playerKey: null, evidence: [] });
export const emptyCoachPlaybookDraft = (): CoachPlaybookDraft => ({ kind: "default", title: "", mapName: "de_mirage", side: "t", purpose: "", trigger: "", body: "", tags: [], phases: [], evidence: [] });
export const emptyMaterialsPageState = (): MaterialsPageState => ({ search: "", typeFilter: null, mapFilter: null, selectedRef: null, newPlaybook: null, newPlaybookDirty: false, newNote: null, newNoteDirty: false });
export function materialStateMatches(state: MaterialPageState | null, ref: MaterialRef): state is MaterialPageState { return state !== null && state.kind === ref.kind && state.id === ref.id; }
