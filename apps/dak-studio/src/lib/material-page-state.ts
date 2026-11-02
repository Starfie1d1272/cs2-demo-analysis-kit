import type { CoachMatchSheetDraft } from "./coach-match-sheet";
import type { ReplayViewState, TableState } from "@cs2dak/presentation";
import type { MaterialRef } from "./material-ref";
import type { CoachAssignmentSetDraft } from "./coach-assignments";
import type { CoachPlaybookDraft } from "./coach-playbook";
import type { StudyNoteDraft } from "./study-notes";

export type MaterialPageState =
  | { kind: "match-sheet"; id: string; draft: CoachMatchSheetDraft; dirty: boolean; baseRevision: string }
  | { kind: "assignment-set"; id: string; draft: CoachAssignmentSetDraft; dirty: boolean; baseRevision: string; observationExpanded: boolean }
  | { kind: "playbook"; id: string; draft: CoachPlaybookDraft; dirty: boolean; baseRevision: string; phaseId: string | null }
  | { kind: "study-note"; id: string; draft: StudyNoteDraft; dirty: boolean; baseRevision: string }
  | { kind: "training-focus"; id: string; draft: { note: string; reviewCondition: string }; dirty: boolean; baseRevision: string }
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
  newMatchSheet: CoachMatchSheetDraft | null;
  newMatchSheetDirty: boolean;
  newNote: StudyNoteDraft | null;
  newNoteDirty: boolean;
}
export const emptyStudyNoteDraft = (): StudyNoteDraft => ({ title: "", body: "", purpose: "review", playerKey: null, evidence: [] });
export const emptyCoachPlaybookDraft = (): CoachPlaybookDraft => ({ kind: "default", title: "", mapName: "de_mirage", side: "t", purpose: "", trigger: "", body: "", tags: [], phases: [], evidence: [] });
export const emptyMaterialsPageState = (): MaterialsPageState => ({ search: "", typeFilter: null, mapFilter: null, selectedRef: null, playbookSide: null, playbookKind: null, playbookTable: { sort: { key: null, direction: "desc" }, page: 0 }, newAssignment: null, newAssignmentDirty: false, newAssignmentObservationExpanded: false, newPlaybook: null, newPlaybookDirty: false, newPlaybookPhaseId: null, newNote: null, newNoteDirty: false, newMatchSheet: null, newMatchSheetDirty: false });
export function materialStateMatches(state: MaterialPageState | null, ref: MaterialRef): state is MaterialPageState { return state !== null && state.kind === ref.kind && state.id === ref.id; }

export type PlaybookLectureState = { kind: "playbook"; id: string; phaseId: string | null; tab: "diagram" | "evidence"; selectedEvidenceId: string | null; replayEntryId: string | null; replayGeneration: number | null; replay: ReplayViewState | null };

export type LecturePageState = PlaybookLectureState | { kind: "match-sheet"; id: string; selectedSectionId: string | null; selectedRefKey: string | null; lectureIndex: number; tab: "content"; playbook: PlaybookLectureState | null };
