import type { ReplayViewState, TableState } from "@cs2dak/presentation";
import type { MaterialRef } from "./material-ref";
import type { CoachAssignmentSetDraft } from "./coach-assignments";
import type { CoachPlaybookDraft } from "./coach-playbook";
import type { StudyNoteDraft } from "./study-notes";

export type MaterialPageState =
  | { kind: "assignment-set"; id: string; draft: CoachAssignmentSetDraft; dirty: boolean; observationExpanded: boolean }
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
  playbookSide: CoachPlaybookDraft["side"] | null;
  playbookKind: CoachPlaybookDraft["kind"] | null;
  playbookTable: TableState;
  newAssignment: CoachAssignmentSetDraft | null;
  newAssignmentDirty: boolean;
  newAssignmentObservationExpanded: boolean;
  newPlaybook: CoachPlaybookDraft | null;
  newPlaybookDirty: boolean;
  newPlaybookPhaseId: string | null;
  newNote: StudyNoteDraft | null;
  newNoteDirty: boolean;
}
export const emptyStudyNoteDraft = (): StudyNoteDraft => ({ title: "", body: "", purpose: "review", playerKey: null, evidence: [] });
export const emptyCoachPlaybookDraft = (): CoachPlaybookDraft => ({ kind: "default", title: "", mapName: "de_mirage", side: "t", purpose: "", trigger: "", body: "", tags: [], phases: [], evidence: [] });
export const emptyMaterialsPageState = (): MaterialsPageState => ({ search: "", typeFilter: null, mapFilter: null, selectedRef: null, playbookSide: null, playbookKind: null, playbookTable: { sort: { key: null, direction: "desc" }, page: 0 }, newAssignment: null, newAssignmentDirty: false, newAssignmentObservationExpanded: false, newPlaybook: null, newPlaybookDirty: false, newPlaybookPhaseId: null, newNote: null, newNoteDirty: false });
export function materialStateMatches(state: MaterialPageState | null, ref: MaterialRef): state is MaterialPageState { return state !== null && state.kind === ref.kind && state.id === ref.id; }

export type LecturePageState = { kind: "playbook"; id: string; phaseId: string | null; tab: "diagram" | "evidence"; selectedEvidenceId: string | null; replayEntryId: string | null; replay: ReplayViewState | null };
