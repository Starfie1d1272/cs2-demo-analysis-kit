export type MaterialRef = {
  kind: "study-note" | "training-focus" | "prep-item" | "practice-lineup" | "playbook" | "assignment-set" | "match-sheet";
  id: string;
};

export type LectureMaterialRef = { kind: "playbook" | "match-sheet"; id: string };
