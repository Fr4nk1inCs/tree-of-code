import { get, set } from 'idb-keyval';
import type { Project } from '../model/project';
import { normalizeProject, validateProject } from '../model/projectFile';

const DRAFT_KEY = 'tree-of-code:current-draft';
const SAVE_DELAY_MS = 350;

export interface Draft {
  project: Project;
  dirty: boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadDraft(): Promise<Draft | null> {
  const draft = await get<Draft | undefined>(DRAFT_KEY);
  if (!draft) return null;
  const errors = validateProject(draft.project);
  if (errors.length > 0) {
    throw new Error(`The saved draft is invalid: ${errors.join(' ')}`);
  }
  return { project: normalizeProject(draft.project), dirty: Boolean(draft.dirty) };
}

export function scheduleDraftSave(
  draft: Draft,
  onSaved: () => void,
  onError: (error: unknown) => void,
): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void set(DRAFT_KEY, draft).then(onSaved).catch(onError);
  }, SAVE_DELAY_MS);
}
