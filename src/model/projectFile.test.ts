import { describe, expect, it } from 'vitest';
import type { RJSFSchema } from '@rjsf/utils';
import {
  PROJECT_FORMAT,
  createEmptyProject,
  type CodeNode,
  type Project,
} from './project';
import {
  parseProjectFile,
  serializeProject,
  validateProject,
} from './projectFile';

const schema: RJSFSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', default: '' },
    priority: { type: 'integer', enum: [1, 2, 3] },
  },
  additionalProperties: false,
};

function node(
  id: string,
  parentId: string | null,
  childIds: string[] = [],
  annotations: Record<string, unknown> = {},
): CodeNode {
  return { id, parentId, childIds, title: id, fragment: `fragment:${id}`, annotations };
}

function projectWith(
  nodes: Record<string, CodeNode>,
  rootIds: string[],
  sharedSchema: RJSFSchema = schema,
): Project {
  return {
    ...createEmptyProject(),
    schema: structuredClone(sharedSchema),
    nodes,
    rootIds,
  };
}

function validProject(): Project {
  return projectWith(
    {
      root: node('root', null, ['child'], { title: 'Root', priority: 1 }),
      child: node('child', 'root', ['leaf'], { title: 'Child' }),
      leaf: node('leaf', 'child', [], { priority: 3 }),
      second: node('second', null),
    },
    ['root', 'second'],
  );
}

describe('project file round trips', () => {
  it('validates empty and populated projects', () => {
    expect(validateProject(createEmptyProject())).toEqual([]);
    expect(validateProject(validProject())).toEqual([]);
  });

  it('serializes pretty JSON and parses a structured clone', () => {
    const original = validProject();
    const text = serializeProject(original);
    expect(text).toContain('\n  "format": "tree-of-code"');
    expect(text.endsWith('\n')).toBe(true);

    const parsed = parseProjectFile(text);
    expect(parsed).toEqual(original);
    expect(parsed).not.toBe(original);
    expect(parsed.nodes).not.toBe(original.nodes);
    expect(parsed.nodes.root).not.toBe(original.nodes.root);
    expect(parsed.nodes.root.childIds).not.toBe(original.nodes.root.childIds);
    expect(parsed.schema).not.toBe(original.schema);

    parsed.nodes.root.childIds.push('new');
    parsed.nodes.root.annotations.title = 'Changed';
    expect(original.nodes.root.childIds).toEqual(['child']);
    expect(original.nodes.root.annotations.title).toBe('Root');
  });

  it('migrates legacy fragment titles without changing annotation values', () => {
    const legacy = validProject();
    for (const current of Object.values(legacy.nodes)) {
      delete (current as Partial<CodeNode>).title;
    }

    const parsed = parseProjectFile(JSON.stringify(legacy));
    expect(parsed.nodes.root.title).toBe('Root');
    expect(parsed.nodes.child.title).toBe('Child');
    expect(parsed.nodes.leaf.title).toBe('');
    expect(parsed.nodes.root.annotations.title).toBe('Root');
    expect(validateProject(legacy)).toEqual([]);
  });

  it('rejects non-string fragment titles', () => {
    const invalid = validProject();
    invalid.nodes.root.title = 3 as unknown as string;
    expect(validateProject(invalid).join('\n')).toContain('/title');
  });

  it('throws one aggregate error for malformed or structurally invalid input', () => {
    expect(() => parseProjectFile('{not json')).toThrow(
      'Invalid project file: malformed JSON',
    );
    const invalid = validProject();
    invalid.format = 'other' as typeof PROJECT_FORMAT;
    invalid.nodes.leaf.annotations.priority = 9;
    invalid.rootIds.push('missing');
    let thrown: unknown;
    try {
      parseProjectFile(JSON.stringify(invalid));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('Invalid project file:');
    expect((thrown as Error).message).toContain('format');
    expect((thrown as Error).message).toContain('missing');
    expect((thrown as Error).message).toContain('priority');
  });
});

describe('project envelope and shared schema validation', () => {
  it.each([
    ['format', 'wrong'],
    ['formatVersion', 2],
    ['language', 'javascript'],
  ])('rejects an incorrect %s', (field, fieldValue) => {
    const project = { ...validProject(), [field]: fieldValue };
    expect(validateProject(project).join('\n')).toContain(`/${field}`);
  });

  it('uses Ajv to reject missing fields and incorrect node field types', () => {
    const missing = { ...validProject() } as Partial<Project>;
    delete missing.nodes;
    expect(validateProject(missing).join('\n')).toContain('nodes');

    const project = validProject();
    const wrongType = {
      ...project,
      nodes: {
        ...project.nodes,
        leaf: { ...project.nodes.leaf, fragment: 42 },
      },
    };
    expect(validateProject(wrongType).join('\n')).toContain('/fragment');
  });

  it('rejects unsupported shared schemas', () => {
    const project = projectWith(
      { root: node('root', null) },
      ['root'],
      { type: 'object', required: ['title'] },
    );
    expect(validateProject(project).join('\n')).toContain('required');
  });

  it('validates every annotation against the shared schema', () => {
    const original = validProject();
    const project = {
      ...original,
      nodes: {
        ...original.nodes,
        root: {
          ...original.nodes.root,
          annotations: { title: 3, priority: 9, extra: true },
        },
        leaf: { ...original.nodes.leaf, annotations: { priority: 2.5 } },
      },
    };
    const errors = validateProject(project).join('\n');
    expect(errors).toContain('Node record "root" annotations');
    expect(errors).toContain('/title');
    expect(errors).toContain('/priority');
    expect(errors).toContain('additional properties');
    expect(errors).toContain('Node record "leaf" annotations');
  });
});

describe('project graph invariants', () => {
  it('rejects duplicate normalized record IDs and duplicate node IDs', () => {
    const records = projectWith(
      {
        node: node('node', null),
        'node ': node('node ', null),
      },
      ['node', 'node '],
    );
    expect(validateProject(records).join('\n')).toContain('duplicate normalized IDs');

    const duplicateNodeIds = projectWith(
      {
        a: node('duplicate', null),
        b: node('duplicate', null),
      },
      ['a', 'b'],
    );
    expect(validateProject(duplicateNodeIds).join('\n')).toContain(
      'duplicate normalized node IDs',
    );
  });

  it('rejects missing and mismatched root references', () => {
    const original = validProject();
    const missing = { ...original, rootIds: [...original.rootIds, 'missing'] };
    expect(validateProject(missing).join('\n')).toContain(
      'rootIds references missing node "missing"',
    );

    const omitted = { ...original, rootIds: ['root'] };
    expect(validateProject(omitted).join('\n')).toContain(
      'Node record "second" is a root but is missing from rootIds',
    );

    const nonRoot = { ...original, rootIds: ['root', 'second', 'child'] };
    expect(validateProject(nonRoot).join('\n')).toContain(
      'Project root "child" must have a null parentId',
    );

    const duplicate = { ...original, rootIds: ['root', 'root', 'second'] };
    expect(validateProject(duplicate).join('\n')).toContain(
      'rootIds lists "root" more than once',
    );
  });

  it('rejects missing parents and non-reciprocal parent/child links', () => {
    const missingParent = projectWith(
      { child: node('child', 'absent') },
      [],
    );
    expect(validateProject(missingParent).join('\n')).toContain(
      'references missing parent "absent"',
    );

    const parentDoesNotListChild = projectWith(
      {
        root: node('root', null),
        child: node('child', 'root'),
      },
      ['root'],
    );
    expect(validateProject(parentDoesNotListChild).join('\n')).toContain(
      'not listed in parent "root" childIds',
    );

    const childDoesNotReciprocate = projectWith(
      {
        root: node('root', null, ['child']),
        child: node('child', null),
      },
      ['root', 'child'],
    );
    expect(validateProject(childDoesNotReciprocate).join('\n')).toContain(
      'whose parentId does not reciprocate',
    );

    const missingChild = projectWith(
      { root: node('root', null, ['missing']) },
      ['root'],
    );
    expect(validateProject(missingChild).join('\n')).toContain(
      'references missing child "missing"',
    );
  });

  it('rejects duplicate child references and record/key mismatches', () => {
    const duplicateChildren = projectWith(
      {
        root: node('root', null, ['child', 'child']),
        child: node('child', 'root'),
      },
      ['root'],
    );
    expect(validateProject(duplicateChildren).join('\n')).toContain(
      'lists child "child" more than once',
    );

    const mismatch = projectWith({ key: node('other', null) }, ['key']);
    expect(validateProject(mismatch).join('\n')).toContain(
      'does not match its record key',
    );
  });

  it('detects cycles, including cycles disconnected from roots', () => {
    const cycle = projectWith(
      {
        a: node('a', 'b', ['b']),
        b: node('b', 'a', ['a']),
      },
      [],
    );
    const errors = validateProject(cycle).join('\n');
    expect(errors).toContain('cycle');
    expect(errors).toContain('orphaned nodes');

    const selfCycle = projectWith(
      { a: node('a', 'a', ['a']) },
      [],
    );
    expect(validateProject(selfCycle).join('\n')).toContain('cycle');
  });

  it('detects orphaned nodes even when they are individually well formed', () => {
    const original = validProject();
    const orphan = {
      ...original,
      nodes: {
        ...original.nodes,
        orphan: node('orphan', null),
      },
    };
    expect(validateProject(orphan).join('\n')).toContain(
      'orphaned nodes: orphan',
    );
  });
});
