/**
 * The phase editor's routes, in one place — the list navigates to them and the
 * editor exits back to the list, so the two must agree (the ingredients wave
 * learned this the hard way with `editorRoute.ts`).
 *
 * There is deliberately no "notes only" route flag: a frozen phase is
 * notes-only by the freeze RULE (`isPhaseFrozen`), which the editor page reads
 * for itself. A URL that could claim otherwise would be a second source of
 * truth — and a deep link to it would bypass the freeze.
 */
export const OBJETIVOS_LIST = '/progress/goals';
export const PHASE_EDITOR_NEW = '/progress/goals/phases/new';
export const phaseEditorPath = (id: string) => `/progress/goals/phases/${id}/edit`;
