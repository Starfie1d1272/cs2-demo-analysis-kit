export type MaterialRef = {
  kind: "study-note" | "training-focus" | "practice-lineup" | "playbook" | "assignment-set" | "match-sheet";
  id: string;
};

export type LectureMaterialRef = { kind: "playbook" | "match-sheet"; id: string };

export type SheetMaterialRef = { kind: Exclude<MaterialRef["kind"], "match-sheet">; id: string };
