import { create } from 'zustand';
import type { AnnotationValues, Project } from '../model/project';
import { createEmptyProject, createId } from '../model/project';
import { applySchema } from '../model/schema';
import {
  addChild,
  addRoot,
  deleteSubtree,
  getSiblingIds,
  getSubtreeIds,
  reparentNode,
  reorderNode,
  splitNode,
} from '../model/tree';
import { loadDraft, scheduleDraftSave } from './draft';
import type { RJSFSchema } from '@rjsf/utils';

export type DraftStatus = 'loading' | 'saving' | 'saved' | 'error';

interface ProjectState {
  project: Project;
  selectedNodeId: string | null;
  collapsedNodeIds: Record<string, boolean>;
  annotationHeights: Record<string, number>;
  editorCursorOffset: number;
  dirty: boolean;
  draftStatus: DraftStatus;
  draftError: string | null;
  initialize: () => Promise<void>;
  newProject: () => void;
  openProject: (project: Project) => void;
  markSaved: () => void;
  selectNode: (nodeId: string) => void;
  setCursorOffset: (offset: number) => void;
  toggleAnnotations: (nodeId: string) => void;
  setAnnotationHeight: (nodeId: string, height: number) => void;
  updateFragment: (nodeId: string, fragment: string) => void;
  updateTitle: (nodeId: string, title: string) => void;
  updateAnnotations: (nodeId: string, annotations: AnnotationValues) => void;
  updateSchema: (schema: RJSFSchema) => void;
  addRoot: () => void;
  addChild: (parentId: string) => void;
  reorder: (nodeId: string, direction: -1 | 1) => void;
  reparent: (nodeId: string, parentId: string | null, index?: number) => void;
  split: (nodeId: string, offset: number) => void;
  remove: (nodeId: string) => void;
}

const firstRoot = (project: Project): string | null => project.rootIds[0] ?? null;

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: createEmptyProject(),
  selectedNodeId: null,
  collapsedNodeIds: {},
  annotationHeights: {},
  editorCursorOffset: 0,
  dirty: false,
  draftStatus: 'loading',
  draftError: null,

  initialize: async () => {
    try {
      const draft = await loadDraft();
      if (draft) {
        set({
          project: draft.project,
          dirty: draft.dirty,
          selectedNodeId: firstRoot(draft.project),
          draftStatus: 'saved',
          draftError: null,
        });
      } else {
        set({ draftStatus: 'saved', draftError: null });
      }
    } catch (error) {
      set({
        draftStatus: 'error',
        draftError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  newProject: () => {
    const project = createEmptyProject();
    set({
      project,
      selectedNodeId: null,
      collapsedNodeIds: {},
      editorCursorOffset: 0,
      dirty: true,
    });
  },

  openProject: (project) => {
    set({
      project: structuredClone(project),
      selectedNodeId: firstRoot(project),
      collapsedNodeIds: {},
      editorCursorOffset: 0,
      dirty: false,
      draftError: null,
    });
  },

  markSaved: () => set({ dirty: false }),
  selectNode: (nodeId) => {
    if (!get().project.nodes[nodeId]) return;
    set({ selectedNodeId: nodeId, editorCursorOffset: 0 });
  },
  setCursorOffset: (editorCursorOffset) => set({ editorCursorOffset }),
  toggleAnnotations: (nodeId) =>
    set((state) => ({
      collapsedNodeIds: {
        ...state.collapsedNodeIds,
        [nodeId]: !state.collapsedNodeIds[nodeId],
      },
    })),
  setAnnotationHeight: (nodeId, height) =>
    set((state) => {
      if (state.annotationHeights[nodeId] === height) return state;
      return { annotationHeights: { ...state.annotationHeights, [nodeId]: height } };
    }),

  updateFragment: (nodeId, fragment) =>
    set((state) => {
      const node = state.project.nodes[nodeId];
      if (!node || node.fragment === fragment) return state;
      return {
        project: {
          ...state.project,
          nodes: { ...state.project.nodes, [nodeId]: { ...node, fragment } },
        },
        dirty: true,
      };
    }),

  updateTitle: (nodeId, title) =>
    set((state) => {
      const node = state.project.nodes[nodeId];
      if (!node || node.title === title) return state;
      return {
        project: {
          ...state.project,
          nodes: { ...state.project.nodes, [nodeId]: { ...node, title } },
        },
        dirty: true,
      };
    }),

  updateAnnotations: (nodeId, annotations) =>
    set((state) => {
      const node = state.project.nodes[nodeId];
      if (!node) return state;
      return {
        project: {
          ...state.project,
          nodes: { ...state.project.nodes, [nodeId]: { ...node, annotations } },
        },
        dirty: true,
      };
    }),

  updateSchema: (schema) =>
    set((state) => ({ project: applySchema(state.project, schema), dirty: true })),

  addRoot: () => {
    const id = createId();
    set((state) => ({
      project: addRoot(state.project, id),
      selectedNodeId: id,
      editorCursorOffset: 0,
      dirty: true,
    }));
  },

  addChild: (parentId) => {
    const id = createId();
    set((state) => ({
      project: addChild(state.project, parentId, id),
      selectedNodeId: id,
      editorCursorOffset: 0,
      dirty: true,
    }));
  },

  reorder: (nodeId, direction) =>
    set((state) => ({ project: reorderNode(state.project, nodeId, direction), dirty: true })),

  reparent: (nodeId, parentId, index) =>
    set((state) => ({
      project: reparentNode(state.project, nodeId, parentId, index),
      selectedNodeId: nodeId,
      dirty: true,
    })),

  split: (nodeId, offset) => {
    const id = createId();
    set((state) => ({
      project: splitNode(state.project, nodeId, offset, id),
      selectedNodeId: id,
      editorCursorOffset: 0,
      dirty: true,
    }));
  },

  remove: (nodeId) =>
    set((state) => {
      const node = state.project.nodes[nodeId];
      if (!node) return state;
      const siblings = getSiblingIds(state.project, nodeId);
      const index = siblings.indexOf(nodeId);
      const fallback = node.parentId ?? siblings[index + 1] ?? siblings[index - 1] ?? null;
      const removed = new Set(getSubtreeIds(state.project, nodeId));
      const project = deleteSubtree(state.project, nodeId);
      return {
        project,
        selectedNodeId: state.selectedNodeId && removed.has(state.selectedNodeId)
          ? fallback
          : state.selectedNodeId,
        dirty: true,
      };
    }),
}));

useProjectStore.subscribe((state, previous) => {
  if (state.project === previous.project && state.dirty === previous.dirty) return;
  useProjectStore.setState({ draftStatus: 'saving', draftError: null });
  scheduleDraftSave(
    { project: state.project, dirty: state.dirty },
    () => useProjectStore.setState({ draftStatus: 'saved', draftError: null }),
    (error) => useProjectStore.setState({
      draftStatus: 'error',
      draftError: error instanceof Error ? error.message : String(error),
    }),
  );
});
