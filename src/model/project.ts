import type { RJSFSchema } from '@rjsf/utils';

export const PROJECT_FORMAT = 'tree-of-code' as const;
export const PROJECT_FORMAT_VERSION = 1 as const;

export type AnnotationValues = Record<string, unknown>;

export interface CodeNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  title: string;
  fragment: string;
  annotations: AnnotationValues;
}

export interface Project {
  format: typeof PROJECT_FORMAT;
  formatVersion: typeof PROJECT_FORMAT_VERSION;
  language: 'python';
  schema: RJSFSchema;
  rootIds: string[];
  nodes: Record<string, CodeNode>;
}

export function getFragmentTitle(node: Pick<CodeNode, 'title' | 'fragment'>): string {
  const title = node.title.trim();
  if (title) return title;
  return node.fragment.split('\n').find((line) => line.trim())?.trim() || 'Untitled fragment';
}

export const DEFAULT_SCHEMA: RJSFSchema = {
  type: 'object',
  title: 'Annotation',
  properties: {
    title: {
      type: 'string',
      title: 'Title',
      description: 'A short label for this fragment.',
    },
  },
  additionalProperties: false,
};

export function createId(): string {
  return globalThis.crypto.randomUUID();
}

export function createEmptyProject(): Project {
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    language: 'python',
    schema: structuredClone(DEFAULT_SCHEMA),
    rootIds: [],
    nodes: {},
  };
}
