/** A location the UI can pass to its host's evidence navigation callback. */
export interface EvidenceRef {
  matchId: string;
  roundNumber: number;
  tick?: number;
  eventKey?: string;
  areaKey?: string;
  reason: string;
  role?: 'example' | 'supporting' | 'counterexample';
}
