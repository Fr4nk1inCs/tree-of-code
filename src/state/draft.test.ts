import 'fake-indexeddb/auto';
import { clear, set } from 'idb-keyval';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../model/project';
import { addRoot } from '../model/tree';
import { loadDraft, scheduleDraftSave } from './draft';

const key = 'tree-of-code:current-draft';

afterEach(async () => {
  vi.useRealTimers();
  await clear();
});

describe('draft persistence', () => {
  it('recovers a valid project and its dirty state', async () => {
    let project = createEmptyProject();
    project = addRoot(project, 'root');
    await set(key, { project, dirty: true });

    const draft = await loadDraft();
    expect(draft?.dirty).toBe(true);
    expect(draft?.project.rootIds).toEqual(['root']);
    expect(draft?.project).not.toBe(project);
  });

  it('migrates a legacy draft title independently of its annotation', async () => {
    let project = createEmptyProject();
    project = addRoot(project, 'root');
    project.nodes.root.annotations.title = 'Legacy fragment';
    delete (project.nodes.root as { title?: string }).title;
    await set(key, { project, dirty: false });

    const draft = await loadDraft();
    expect(draft?.project.nodes.root.title).toBe('Legacy fragment');
    expect(draft?.project.nodes.root.annotations.title).toBe('Legacy fragment');
  });

  it('rejects an invalid draft instead of loading it', async () => {
    await set(key, { project: { format: 'wrong' }, dirty: true });
    await expect(loadDraft()).rejects.toThrow('saved draft is invalid');
  });

  it('debounces writes to the single draft key', async () => {
    vi.useFakeTimers();
    const project = createEmptyProject();
    const saved = vi.fn();
    const failed = vi.fn();
    scheduleDraftSave({ project, dirty: true }, saved, failed);
    expect(saved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();
    expect(saved).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    expect((await loadDraft())?.project).toEqual(project);
  });
});
