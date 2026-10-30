import { describe, expect, it } from 'vitest';
import type { RJSFSchema } from '@rjsf/utils';
import { createEmptyProject } from './project';
import {
  applySchema,
  assertSupportedSchema,
  createAnnotationDefaults,
  getSchemaValidationErrors,
  parseSchemaInput,
  validateAnnotationValues,
} from './schema';
import { addRoot } from './tree';

const supportedSchema: RJSFSchema = {
  type: 'object',
  title: 'Annotations',
  description: 'Supported scalar annotations.',
  properties: {
    text: {
      type: 'string',
      title: 'Text',
      description: 'Long text',
      format: 'textarea',
      default: 'hello',
    },
    count: { type: 'integer', default: 1 },
    ratio: { type: 'number', enum: [0.5, 1.5], default: 0.5 },
    enabled: { type: 'boolean', default: false },
    mode: { type: 'string', enum: ['a', 'b'] },
    untyped: { title: 'Any scalar' },
  },
  additionalProperties: false,
};

describe('schema support validation', () => {
  it('accepts supported schemas, including omitted optional fields', () => {
    expect(getSchemaValidationErrors(supportedSchema)).toEqual([]);
    expect(getSchemaValidationErrors({})).toEqual([]);
    expect(getSchemaValidationErrors({ type: 'object' })).toEqual([]);
    expect(() => assertSupportedSchema(supportedSchema)).not.toThrow();
  });

  it('accepts nested objects, arrays, defaults, and nested textareas', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' }, default: ['python'] },
        details: {
          type: 'object',
          properties: {
            note: { type: 'string', format: 'textarea' },
            scores: { type: 'array', items: { type: 'number' } },
          },
          additionalProperties: false,
          default: { note: 'keep', scores: [1, 2] },
        },
      },
    };
    expect(getSchemaValidationErrors(schema)).toEqual([]);
    expect(createAnnotationDefaults(schema)).toEqual({
      tags: ['python'],
      details: { note: 'keep', scores: [1, 2] },
    });
  });

  it.each([
    [{ type: 'array' }, 'root type'],
    [{ type: 'object', required: ['x'] }, 'required'],
    [{ type: 'object', properties: { x: { $ref: '#/x' } } }, '$ref'],
    [{ type: 'object', properties: { x: { type: 'array' } } }, 'items schema'],
    [{ type: 'object', properties: { x: { type: 'array', items: [{ type: 'string' }] } } }, 'items schema must be an object'],
    [{ type: 'object', properties: { x: { type: 'object', required: ['name'] } } }, 'required'],
    [{ type: 'object', properties: [] }, 'properties must be an object'],
    [{ type: 'object', additionalProperties: 'no' }, 'additionalProperties'],
    [{ type: 'object', properties: { x: { type: 'string', minLength: 2 } } }, 'minLength'],
    [{ type: 'object', properties: { x: { type: 'number', format: 'textarea' } } }, 'format'],
    [{ type: 'object', properties: { x: { type: 'integer', default: 1.2 } } }, 'default'],
    [{ type: 'object', properties: { x: { type: 'string', default: 2 } } }, 'default'],
    [{ type: 'object', properties: { x: { type: 'string', enum: [] } } }, 'non-empty'],
    [{ type: 'object', properties: { x: { type: 'string', enum: ['a', 1] } } }, 'does not match'],
    [{ type: 'object', properties: { x: { type: 'string', enum: ['a', 'a'] } } }, 'unique'],
    [{ type: 'object', properties: { x: { type: 'string', enum: ['a'], default: 'b' } } }, 'one of its enum'],
    [{ type: 'object', properties: { x: { enum: ['a', true] } } }, 'consistent scalar type'],
    [{ type: 'object', title: 3 }, 'title must be a string'],
  ])('rejects unsupported or inconsistent schema %#', (schema, message) => {
    const errors = getSchemaValidationErrors(schema);
    expect(errors.join('\n')).toContain(message);
    expect(() => assertSupportedSchema(schema)).toThrow('Unsupported annotation schema');
  });

  it('aggregates schema errors descriptively', () => {
    expect(() =>
      assertSupportedSchema({
        type: 'object',
        required: ['x'],
        properties: { x: { type: 'null' } },
      }),
    ).toThrow(/required[\s\S]*type must be one of/);
  });
});

describe('parseSchemaInput', () => {
  it('parses JSON and returns an independent supported schema', () => {
    const text = JSON.stringify(supportedSchema);
    const parsed = parseSchemaInput(text);
    expect(parsed).toEqual(supportedSchema);
    expect(parsed).not.toBe(supportedSchema);
    (parsed.properties as Record<string, { title?: string }>).text.title = 'Changed';
    expect((supportedSchema.properties as Record<string, { title?: string }>).text.title).toBe('Text');
  });

  it('throws for malformed JSON and unsupported schemas', () => {
    expect(() => parseSchemaInput('{')).toThrow('Invalid schema JSON');
    expect(() => parseSchemaInput('null')).toThrow('Schema root must be an object');
    expect(() => parseSchemaInput('{"type":"object","required":[]}')).toThrow(
      'required',
    );
  });
});

describe('annotation defaults and validation', () => {
  it('creates defaults only for properties that declare them', () => {
    expect(createAnnotationDefaults(supportedSchema)).toEqual({
      text: 'hello',
      count: 1,
      ratio: 0.5,
      enabled: false,
    });
    expect(createAnnotationDefaults({ type: 'object' })).toEqual({});
  });

  it('accepts valid values with Ajv, including textarea and enum schemas', () => {
    expect(
      validateAnnotationValues(supportedSchema, {
        text: 'multi\nline',
        count: -2,
        ratio: 1.5,
        enabled: true,
        mode: 'a',
        untyped: 42,
      }),
    ).toEqual([]);
    expect(validateAnnotationValues(supportedSchema, {})).toEqual([]);
  });

  it('validates nested objects and every array item', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              values: { type: 'array', items: { type: 'integer' } },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    };
    expect(validateAnnotationValues(schema, {
      groups: [{ name: 'first', values: [1, 2] }],
    })).toEqual([]);
    const errors = validateAnnotationValues(schema, {
      groups: [{ name: 'first', values: [1, 2.5], removed: true }],
    }).join('\n');
    expect(errors).toContain('/groups/0/values/1');
    expect(errors).toContain('additional properties');
  });

  it('reports type, integer, enum, root, and additional-property errors', () => {
    const errors = validateAnnotationValues(supportedSchema, {
      text: 4,
      count: 1.2,
      ratio: 2,
      enabled: 'yes',
      mode: 'c',
      untyped: { nested: true },
      extra: true,
    });
    expect(errors.join('\n')).toContain('/text');
    expect(errors.join('\n')).toContain('/count');
    expect(errors.join('\n')).toContain('/ratio');
    expect(errors.join('\n')).toContain('/enabled');
    expect(errors.join('\n')).toContain('/mode');
    expect(errors.join('\n')).toContain('/untyped must be a scalar');
    expect(errors.join('\n')).toContain('additional properties');
    expect(validateAnnotationValues(supportedSchema, null).join('\n')).toContain(
      'must be object',
    );
    expect(validateAnnotationValues(supportedSchema, []).join('\n')).toContain(
      'must be object',
    );
  });

  it('honors additionalProperties true and validates omitted property types as scalar', () => {
    const schema: RJSFSchema = {
      properties: { value: {} },
      additionalProperties: true,
    };
    expect(validateAnnotationValues(schema, { value: false, other: [1] })).toEqual([]);
    expect(validateAnnotationValues(schema, { value: [1] })).toEqual([
      '/value must be a scalar value.',
    ]);
  });
});

describe('applySchema', () => {
  it('removes deleted and incompatible values while preserving valid values', () => {
    const oldSchema: RJSFSchema = {
      type: 'object',
      properties: {
        unchanged: { type: 'string' },
        narrowed: { type: 'string' },
        changedType: { type: 'string' },
        removed: { type: 'boolean' },
        nowInteger: { type: 'number' },
      },
      additionalProperties: false,
    };
    const nextSchema: RJSFSchema = {
      type: 'object',
      properties: {
        unchanged: { type: 'string' },
        narrowed: { type: 'string', enum: ['keep'] },
        changedType: { type: 'integer', default: 3 },
        nowInteger: { type: 'integer' },
        added: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    };
    const empty = { ...createEmptyProject(), schema: oldSchema };
    const withRoot = addRoot(empty, 'root');
    const original = {
      ...withRoot,
      nodes: {
        ...withRoot.nodes,
        root: {
          ...withRoot.nodes.root,
          annotations: {
            unchanged: 'still valid',
            narrowed: 'discard',
            changedType: '4',
            removed: true,
            nowInteger: 4,
          },
        },
      },
    };

    const project = applySchema(original, nextSchema);
    expect(project.nodes.root.annotations).toEqual({
      unchanged: 'still valid',
      nowInteger: 4,
    });
    expect(project.schema).toEqual(nextSchema);
    expect(project.schema).not.toBe(nextSchema);
    expect(project.rootIds).toBe(original.rootIds);
    expect(original.nodes.root.annotations).toEqual({
      unchanged: 'still valid',
      narrowed: 'discard',
      changedType: '4',
      removed: true,
      nowInteger: 4,
    });
    expect(original.schema).toBe(oldSchema);
  });

  it('keeps values valid under a changed enum and handles all nodes independently', () => {
    const oldSchema: RJSFSchema = {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['a', 'b'] } },
    };
    const nextSchema: RJSFSchema = {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['a'] } },
    };
    let project = { ...createEmptyProject(), schema: oldSchema };
    project = addRoot(project, 'a');
    project = addRoot(project, 'b');
    project = {
      ...project,
      nodes: {
        a: { ...project.nodes.a, annotations: { mode: 'a' } },
        b: { ...project.nodes.b, annotations: { mode: 'b' } },
      },
    };
    const result = applySchema(project, nextSchema);
    expect(result.nodes.a.annotations).toEqual({ mode: 'a' });
    expect(result.nodes.b.annotations).toEqual({});
  });

  it('prunes removed nested fields and clears arrays with incompatible items', () => {
    let project = createEmptyProject();
    project = addRoot(project, 'root');
    project.nodes.root.annotations = {
      details: { keep: 'value', remove: true },
      values: [1, 2, 3],
    };
    const nextSchema: RJSFSchema = {
      type: 'object',
      properties: {
        details: {
          type: 'object',
          properties: { keep: { type: 'string' } },
          additionalProperties: false,
        },
        values: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    };
    const result = applySchema(project, nextSchema);
    expect(result.nodes.root.annotations).toEqual({ details: { keep: 'value' } });
  });
});
