import { describe, expect, it } from 'vitest';
import type { RJSFSchema } from '@rjsf/utils';
import { createEmptyProject, type Project } from './project';
import {
  addChild,
  addRoot,
  deleteSubtree,
  getNodePath,
  getSiblingIds,
  getSubtreeIds,
  reparentNode,
  reorderNode,
  splitNode,
} from './tree';

const schema: RJSFSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', default: 'Untitled' },
    priority: { type: 'integer', default: 1 },
  },
  additionalProperties: false,
};

function emptyProject(): Project {
  return { ...createEmptyProject(), schema: structuredClone(schema) };
}

function populatedProject(): Project {
  let project = emptyProject();
  project = addRoot(project, 'a');
  project = addRoot(project, 'b');
  project = addChild(project, 'a', 'a1');
  project = addChild(project, 'a', 'a2');
  project = addChild(project, 'a1', 'leaf');
  project = addChild(project, 'b', 'b1');
  return {
    ...project,
    nodes: {
      ...project.nodes,
      a: { ...project.nodes.a, annotations: { title: 'A', priority: 5 } },
    },
  };
}

describe('node creation', () => {
  it('adds roots in order with empty fragments and schema defaults', () => {
    const original = emptyProject();
    const withGeneratedId = addRoot(original);
    const generatedId = withGeneratedId.rootIds[0];
    const project = addRoot(withGeneratedId, 'second');

    expect(generatedId).toEqual(expect.any(String));
    expect(generatedId.length).toBeGreaterThan(0);
    expect(project.rootIds).toEqual([generatedId, 'second']);
    expect(project.nodes.second).toEqual({
      id: 'second',
      parentId: null,
      childIds: [],
      title: '',
      fragment: '',
      annotations: { title: 'Untitled', priority: 1 },
    });
    expect(original.rootIds).toEqual([]);
    expect(original.nodes).toEqual({});
    expect(withGeneratedId.rootIds).toEqual([generatedId]);
  });

  it('adds a child without changing roots or the original parent', () => {
    const original = addRoot(emptyProject(), 'root');
    const project = addChild(original, 'root', 'child');

    expect(project.rootIds).toEqual(['root']);
    expect(project.nodes.root.childIds).toEqual(['child']);
    expect(project.nodes.child).toMatchObject({
      id: 'child',
      parentId: 'root',
      fragment: '',
      annotations: { title: 'Untitled', priority: 1 },
    });
    expect(original.nodes.root.childIds).toEqual([]);
    expect(original.nodes.child).toBeUndefined();
  });

  it('rejects missing parents and duplicate IDs', () => {
    const project = addRoot(emptyProject(), 'root');
    expect(() => addChild(project, 'missing', 'child')).toThrow(
      'Node "missing" does not exist',
    );
    expect(() => addRoot(project, 'root')).toThrow('ID "root" is already in use');
    expect(() => addChild(project, 'root', 'root')).toThrow(
      'ID "root" is already in use',
    );
  });
});

describe('reorderNode', () => {
  it('reorders roots and children in either direction immutably', () => {
    const original = populatedProject();
    const roots = reorderNode(original, 'b', -1);
    const children = reorderNode(roots, 'a2', -1);
    const back = reorderNode(children, 'a2', 1);

    expect(roots.rootIds).toEqual(['b', 'a']);
    expect(children.nodes.a.childIds).toEqual(['a2', 'a1']);
    expect(back.nodes.a.childIds).toEqual(['a1', 'a2']);
    expect(original.rootIds).toEqual(['a', 'b']);
    expect(original.nodes.a.childIds).toEqual(['a1', 'a2']);
  });

  it('returns the same project at boundaries and rejects missing nodes', () => {
    const project = populatedProject();
    expect(reorderNode(project, 'a', -1)).toBe(project);
    expect(reorderNode(project, 'a2', 1)).toBe(project);
    expect(() => reorderNode(project, 'missing', 1)).toThrow('does not exist');
  });
});

describe('reparentNode', () => {
  it('moves a complete subtree to an indexed destination', () => {
    const original = populatedProject();
    const project = reparentNode(original, 'a1', 'b', 0);

    expect(project.nodes.a.childIds).toEqual(['a2']);
    expect(project.nodes.b.childIds).toEqual(['a1', 'b1']);
    expect(project.nodes.a1.parentId).toBe('b');
    expect(project.nodes.leaf.parentId).toBe('a1');
    expect(project.nodes.a1.childIds).toEqual(['leaf']);
    expect(project.nodes.leaf).toBe(original.nodes.leaf);
    expect(original.nodes.a.childIds).toEqual(['a1', 'a2']);
    expect(original.nodes.b.childIds).toEqual(['b1']);
  });

  it('moves nodes to and from rootIds, appending by default', () => {
    const original = populatedProject();
    const asRoot = reparentNode(original, 'a1', null);
    expect(asRoot.rootIds).toEqual(['a', 'b', 'a1']);
    expect(asRoot.nodes.a.childIds).toEqual(['a2']);
    expect(asRoot.nodes.a1.parentId).toBeNull();

    const asChild = reparentNode(asRoot, 'b', 'a1');
    expect(asChild.rootIds).toEqual(['a', 'a1']);
    expect(asChild.nodes.a1.childIds).toEqual(['leaf', 'b']);
    expect(asChild.nodes.b.parentId).toBe('a1');
    expect(asChild.nodes.b1.parentId).toBe('b');
  });

  it('supports indexed reordering within the same parent and ignores exact no-ops', () => {
    const original = populatedProject();
    const reordered = reparentNode(original, 'a1', 'a', 1);
    expect(reordered.nodes.a.childIds).toEqual(['a2', 'a1']);
    expect(reordered.nodes.a1.parentId).toBe('a');
    expect(reparentNode(original, 'a1', 'a', 0)).toBe(original);
    expect(reparentNode(original, 'a2', 'a')).toBe(original);
  });

  it('rejects cycles, missing targets, and invalid insertion indices', () => {
    const project = populatedProject();
    expect(() => reparentNode(project, 'a', 'a1')).toThrow('within its subtree');
    expect(() => reparentNode(project, 'a1', 'a1')).toThrow('within its subtree');
    expect(() => reparentNode(project, 'a1', 'missing')).toThrow('does not exist');
    expect(() => reparentNode(project, 'a1', 'b', -1)).toThrow('valid range');
    expect(() => reparentNode(project, 'a1', 'b', 2)).toThrow('valid range');
    expect(() => reparentNode(project, 'a1', 'b', 0.5)).toThrow('valid range');
  });
});

describe('splitNode', () => {
  it('keeps the prefix and annotations and moves suffix and children to a new child', () => {
    let original = populatedProject();
    original = {
      ...original,
      nodes: {
        ...original.nodes,
        a1: {
          ...original.nodes.a1,
          title: 'Original fragment',
          fragment: 'prefix-suffix',
          annotations: { title: 'Keep me', priority: 9 },
        },
      },
    };
    const project = splitNode(original, 'a1', 7, 'suffix');

    expect(project.nodes.a1.fragment).toBe('prefix-');
    expect(project.nodes.a1.title).toBe('Original fragment');
    expect(project.nodes.a1.annotations).toEqual({ title: 'Keep me', priority: 9 });
    expect(project.nodes.a1.childIds).toEqual(['suffix']);
    expect(project.nodes.suffix).toMatchObject({
      id: 'suffix',
      parentId: 'a1',
      title: '',
      fragment: 'suffix',
      childIds: ['leaf'],
      annotations: { title: 'Untitled', priority: 1 },
    });
    expect(project.nodes.leaf.parentId).toBe('suffix');
    expect(original.nodes.a1.fragment).toBe('prefix-suffix');
    expect(original.nodes.a1.childIds).toEqual(['leaf']);
    expect(original.nodes.leaf.parentId).toBe('a1');
  });

  it.each([0, 6])('allows boundary offset %i', (offset) => {
    let project = addRoot(emptyProject(), 'root');
    project = {
      ...project,
      nodes: {
        ...project.nodes,
        root: { ...project.nodes.root, fragment: 'abcdef' },
      },
    };
    const result = splitNode(project, 'root', offset, 'suffix');
    expect(result.nodes.root.fragment).toBe('abcdef'.slice(0, offset));
    expect(result.nodes.suffix.fragment).toBe('abcdef'.slice(offset));
  });

  it('rejects invalid offsets, duplicate IDs, and missing nodes', () => {
    let project = addRoot(emptyProject(), 'root');
    project = {
      ...project,
      nodes: {
        ...project.nodes,
        root: { ...project.nodes.root, fragment: 'abc' },
      },
    };
    for (const offset of [-1, 4, 1.5, Number.NaN]) {
      expect(() => splitNode(project, 'root', offset)).toThrow('Split offset');
    }
    expect(() => splitNode(project, 'root', 1, 'root')).toThrow('already in use');
    expect(() => splitNode(project, 'missing', 0)).toThrow('does not exist');
  });
});

describe('tree queries and deletion', () => {
  it('returns subtree IDs in depth-first preorder', () => {
    const project = populatedProject();
    expect(getSubtreeIds(project, 'a')).toEqual(['a', 'a1', 'leaf', 'a2']);
    expect(getSubtreeIds(project, 'leaf')).toEqual(['leaf']);
    expect(() => getSubtreeIds(project, 'missing')).toThrow('does not exist');
  });

  it('returns defensive copies of root and child sibling lists', () => {
    const project = populatedProject();
    const roots = getSiblingIds(project, 'a');
    const children = getSiblingIds(project, 'a1');
    expect(roots).toEqual(['a', 'b']);
    expect(children).toEqual(['a1', 'a2']);
    roots.push('fake');
    expect(project.rootIds).toEqual(['a', 'b']);
    expect(() => getSiblingIds(project, 'missing')).toThrow('does not exist');
  });

  it('returns node paths from root to node', () => {
    const project = populatedProject();
    expect(getNodePath(project, 'leaf').map((node) => node.id)).toEqual([
      'a',
      'a1',
      'leaf',
    ]);
    expect(getNodePath(project, 'b').map((node) => node.id)).toEqual(['b']);
    expect(() => getNodePath(project, 'missing')).toThrow('does not exist');
  });

  it('deletes a nested subtree and removes its parent reference only', () => {
    const original = populatedProject();
    const project = deleteSubtree(original, 'a1');
    expect(Object.keys(project.nodes).sort()).toEqual(['a', 'a2', 'b', 'b1']);
    expect(project.nodes.a.childIds).toEqual(['a2']);
    expect(project.rootIds).toEqual(['a', 'b']);
    expect(original.nodes.a1).toBeDefined();
    expect(original.nodes.leaf).toBeDefined();
    expect(original.nodes.a.childIds).toEqual(['a1', 'a2']);
  });

  it('deletes a root subtree and its root reference', () => {
    const original = populatedProject();
    const project = deleteSubtree(original, 'a');
    expect(project.rootIds).toEqual(['b']);
    expect(Object.keys(project.nodes).sort()).toEqual(['b', 'b1']);
    expect(() => deleteSubtree(project, 'a')).toThrow('does not exist');
  });
});
