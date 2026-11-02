import type { StudioPageId } from "./studio-navigation.js";

/** Unmigrated pages own no serializable UI state yet. */
export type StudioPageStateMap = { [P in StudioPageId]: null };
