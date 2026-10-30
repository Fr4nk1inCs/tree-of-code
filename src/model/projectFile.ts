import Ajv from 'ajv';
import type { RJSFSchema } from '@rjsf/utils';
import {
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  type Project,
} from './project';
import {
  getSchemaValidationErrors,
  validateAnnotationValues,
} from './schema';

const PROJECT_VALIDATION_SCHEMA = {
  type: 'object',
  required: ['format', 'formatVersion', 'language', 'schema', 'rootIds', 'nodes'],
  additionalProperties: false,
  properties: {
    format: { const: PROJECT_FORMAT },
    formatVersion: { const: PROJECT_FORMAT_VERSION },
    language: { const: 'python' },
    schema: {},
    rootIds: { type: 'array', items: { type: 'string' } },
    nodes: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['id', 'parentId', 'childIds', 'fragment', 'annotations'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          parentId: { type: ['string', 'null'] },
          childIds: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          fragment: { type: 'string' },
          annotations: { type: 'object' },
        },
      },
    },
  },
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizedId(id: string): string {
  return id.trim().normalize('NFC');
}

function formatAjvError(instancePath: string, message: string | undefined): string {
  return `Project ${instancePath || '/'} ${message ?? 'is invalid'}.`;
}

export function validateProject(value: unknown): string[] {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(PROJECT_VALIDATION_SCHEMA);
  validate(value);
  const errors = (validate.errors ?? []).map((error) =>
    formatAjvError(error.instancePath, error.message),
  );

  if (!isObject(value)) {
    return errors;
  }

  const schemaErrors = getSchemaValidationErrors(value.schema);
  errors.push(...schemaErrors.map((error) => `Project schema: ${error}`));

  const roots = Array.isArray(value.rootIds)
    ? value.rootIds.filter((id): id is string => typeof id === 'string')
    : [];
  const records = isObject(value.nodes) ? value.nodes : {};
  const normalizedRecordIds = new Map<string, string>();
  const normalizedNodeIds = new Map<string, string>();

  for (const [recordId, node] of Object.entries(records)) {
    const location = `Node record "${recordId}"`;
    const normalizedRecordId = normalizedId(recordId);
    if (!normalizedRecordId) {
      errors.push(`${location} has an empty ID.`);
    } else if (recordId !== normalizedRecordId) {
      errors.push(`${location} must use its trimmed, Unicode-normalized ID as the record key.`);
    }
    const priorRecord = normalizedRecordIds.get(normalizedRecordId);
    if (priorRecord !== undefined && priorRecord !== recordId) {
      errors.push(
        `Node records "${priorRecord}" and "${recordId}" have duplicate normalized IDs.`,
      );
    } else {
      normalizedRecordIds.set(normalizedRecordId, recordId);
    }

    if (!isObject(node)) {
      continue;
    }
    if (typeof node.id === 'string') {
      const normalizedNodeId = normalizedId(node.id);
      if (!normalizedNodeId) {
        errors.push(`${location} has an empty node ID.`);
      } else if (node.id !== normalizedNodeId) {
        errors.push(`${location} node ID must be trimmed and Unicode-normalized.`);
      }
      if (node.id !== recordId) {
        errors.push(`${location} node ID "${node.id}" does not match its record key.`);
      }
      const priorNode = normalizedNodeIds.get(normalizedNodeId);
      if (priorNode !== undefined && priorNode !== recordId) {
        errors.push(
          `Node records "${priorNode}" and "${recordId}" contain duplicate normalized node IDs.`,
        );
      } else {
        normalizedNodeIds.set(normalizedNodeId, recordId);
      }
    }

    if (node.parentId !== null && typeof node.parentId === 'string') {
      const parent = hasOwn(records, node.parentId) ? records[node.parentId] : undefined;
      if (!isObject(parent)) {
        errors.push(`${location} references missing parent "${node.parentId}".`);
      } else if (
        !Array.isArray(parent.childIds) ||
        !parent.childIds.includes(recordId)
      ) {
        errors.push(
          `${location} is not listed in parent "${node.parentId}" childIds.`,
        );
      }
    }
    if (node.parentId === null && !roots.includes(recordId)) {
      errors.push(`${location} is a root but is missing from rootIds.`);
    }
    if (node.parentId !== null && roots.includes(recordId)) {
      errors.push(`${location} has a parent but is also listed in rootIds.`);
    }

    if (Array.isArray(node.childIds)) {
      const seenChildren = new Set<string>();
      for (const childId of node.childIds) {
        if (typeof childId !== 'string') {
          continue;
        }
        if (seenChildren.has(childId)) {
          errors.push(`${location} lists child "${childId}" more than once.`);
        }
        seenChildren.add(childId);
        const child = hasOwn(records, childId) ? records[childId] : undefined;
        if (!isObject(child)) {
          errors.push(`${location} references missing child "${childId}".`);
        } else if (child.parentId !== recordId) {
          errors.push(
            `${location} lists child "${childId}", whose parentId does not reciprocate.`,
          );
        }
      }
    }

    if (schemaErrors.length === 0) {
      const annotationErrors = validateAnnotationValues(
        value.schema as RJSFSchema,
        node.annotations,
      );
      errors.push(
        ...annotationErrors.map((error) => `${location} annotations: ${error}`),
      );
    }
  }

  const seenRoots = new Set<string>();
  for (const rootId of roots) {
    if (seenRoots.has(rootId)) {
      errors.push(`Project rootIds lists "${rootId}" more than once.`);
    }
    seenRoots.add(rootId);
    const root = hasOwn(records, rootId) ? records[rootId] : undefined;
    if (!isObject(root)) {
      errors.push(`Project rootIds references missing node "${rootId}".`);
    } else if (root.parentId !== null) {
      errors.push(`Project root "${rootId}" must have a null parentId.`);
    }
  }

  const reachable = new Set<string>();
  function markReachable(id: string): void {
    if (reachable.has(id)) {
      return;
    }
    const node = hasOwn(records, id) ? records[id] : undefined;
    if (!isObject(node)) {
      return;
    }
    reachable.add(id);
    if (Array.isArray(node.childIds)) {
      for (const childId of node.childIds) {
        if (typeof childId === 'string') {
          markReachable(childId);
        }
      }
    }
  }
  for (const rootId of roots) {
    markReachable(rootId);
  }
  const orphans = Object.keys(records).filter((id) => !reachable.has(id));
  if (orphans.length > 0) {
    errors.push(`Project contains orphaned nodes: ${orphans.join(', ')}.`);
  }

  const states = new Map<string, 'visiting' | 'visited'>();
  const reportedCycles = new Set<string>();
  function checkCycles(id: string): void {
    if (states.get(id) === 'visited') {
      return;
    }
    if (states.get(id) === 'visiting') {
      if (!reportedCycles.has(id)) {
        errors.push(`Project contains a cycle involving node "${id}".`);
        reportedCycles.add(id);
      }
      return;
    }
    states.set(id, 'visiting');
    const node = hasOwn(records, id) ? records[id] : undefined;
    if (isObject(node) && Array.isArray(node.childIds)) {
      for (const childId of node.childIds) {
        if (typeof childId === 'string' && hasOwn(records, childId)) {
          checkCycles(childId);
        }
      }
    }
    states.set(id, 'visited');
  }
  for (const id of Object.keys(records)) {
    checkCycles(id);
  }

  return errors;
}

export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function normalizeProject(value: unknown): Project {
  const project = structuredClone(value) as Project;
  for (const node of Object.values(project.nodes)) {
    if (typeof node.title === 'string') continue;
    const annotationTitle = node.annotations.title;
    node.title = typeof annotationTitle === 'string' ? annotationTitle : '';
  }
  return project;
}

export function parseProjectFile(text: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Invalid project file: malformed JSON.${detail}`);
  }

  const errors = validateProject(parsed);
  if (errors.length > 0) {
    throw new Error(`Invalid project file:\n- ${errors.join('\n- ')}`);
  }
  return normalizeProject(parsed);
}
