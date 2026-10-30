import {
  createId,
  type AnnotationValues,
  type CodeNode,
  type Project,
} from './project';
import { createAnnotationDefaults } from './schema';

function requireNode(project: Project, nodeId: string): CodeNode {
  const node = project.nodes[nodeId];
  if (!node) {
    throw new Error(`Node "${nodeId}" does not exist.`);
  }
  return node;
}

function reserveId(project: Project, requestedId: string | undefined): string {
  const id = requestedId ?? createId();
  if (project.nodes[id]) {
    throw new Error(`Cannot create node: ID "${id}" is already in use.`);
  }
  return id;
}

function newNode(
  project: Project,
  id: string,
  parentId: string | null,
): CodeNode {
  const annotations: AnnotationValues = createAnnotationDefaults(project.schema);
  return {
    id,
    parentId,
    childIds: [],
    title: '',
    fragment: '',
    annotations,
  };
}

function siblingsOf(project: Project, node: CodeNode): string[] {
  if (node.parentId === null) {
    return project.rootIds;
  }
  return requireNode(project, node.parentId).childIds;
}

export function addRoot(project: Project, id?: string): Project {
  const rootId = reserveId(project, id);
  return {
    ...project,
    rootIds: [...project.rootIds, rootId],
    nodes: { ...project.nodes, [rootId]: newNode(project, rootId, null) },
  };
}

export function addChild(
  project: Project,
  parentId: string,
  id?: string,
): Project {
  const parent = requireNode(project, parentId);
  const childId = reserveId(project, id);
  return {
    ...project,
    nodes: {
      ...project.nodes,
      [parentId]: { ...parent, childIds: [...parent.childIds, childId] },
      [childId]: newNode(project, childId, parentId),
    },
  };
}

export function reorderNode(
  project: Project,
  nodeId: string,
  direction: -1 | 1,
): Project {
  const node = requireNode(project, nodeId);
  const siblings = siblingsOf(project, node);
  const oldIndex = siblings.indexOf(nodeId);
  const newIndex = oldIndex + direction;

  if (oldIndex < 0) {
    throw new Error(`Node "${nodeId}" is missing from its sibling list.`);
  }
  if (newIndex < 0 || newIndex >= siblings.length) {
    return project;
  }

  const reordered = [...siblings];
  [reordered[oldIndex], reordered[newIndex]] = [
    reordered[newIndex],
    reordered[oldIndex],
  ];

  if (node.parentId === null) {
    return { ...project, rootIds: reordered };
  }

  const parent = requireNode(project, node.parentId);
  return {
    ...project,
    nodes: {
      ...project.nodes,
      [parent.id]: { ...parent, childIds: reordered },
    },
  };
}

export function reparentNode(
  project: Project,
  nodeId: string,
  newParentId: string | null,
  index?: number,
): Project {
  const node = requireNode(project, nodeId);
  if (newParentId !== null) {
    requireNode(project, newParentId);
    if (getSubtreeIds(project, nodeId).includes(newParentId)) {
      throw new Error(
        `Cannot reparent node "${nodeId}" under "${newParentId}": the target is within its subtree.`,
      );
    }
  }

  const oldSiblings = siblingsOf(project, node);
  const oldIndex = oldSiblings.indexOf(nodeId);
  if (oldIndex < 0) {
    throw new Error(`Node "${nodeId}" is missing from its sibling list.`);
  }

  const sameList = node.parentId === newParentId;
  const destination = sameList
    ? oldSiblings.filter((id) => id !== nodeId)
    : newParentId === null
      ? [...project.rootIds]
      : [...requireNode(project, newParentId).childIds];
  const insertionIndex = index ?? destination.length;

  if (
    !Number.isInteger(insertionIndex) ||
    insertionIndex < 0 ||
    insertionIndex > destination.length
  ) {
    throw new Error(
      `Reparent index ${String(index)} is outside the valid range 0-${destination.length}.`,
    );
  }
  if (sameList && insertionIndex === oldIndex) {
    return project;
  }

  const nextDestination = [...destination];
  nextDestination.splice(insertionIndex, 0, nodeId);
  const nodes = { ...project.nodes };
  let rootIds = project.rootIds;

  if (sameList) {
    if (newParentId === null) {
      rootIds = nextDestination;
    } else {
      const parent = requireNode(project, newParentId);
      nodes[newParentId] = { ...parent, childIds: nextDestination };
    }
  } else {
    const remaining = oldSiblings.filter((id) => id !== nodeId);
    if (node.parentId === null) {
      rootIds = remaining;
    } else {
      const oldParent = requireNode(project, node.parentId);
      nodes[oldParent.id] = { ...oldParent, childIds: remaining };
    }

    if (newParentId === null) {
      rootIds = nextDestination;
    } else {
      const newParent = requireNode(project, newParentId);
      nodes[newParentId] = { ...newParent, childIds: nextDestination };
    }
    nodes[nodeId] = { ...node, parentId: newParentId };
  }

  return { ...project, rootIds, nodes };
}

export function splitNode(
  project: Project,
  nodeId: string,
  offset: number,
  newId?: string,
): Project {
  const node = requireNode(project, nodeId);
  if (!Number.isInteger(offset) || offset < 0 || offset > node.fragment.length) {
    throw new Error(
      `Split offset ${String(offset)} is outside the valid range 0-${node.fragment.length} for node "${nodeId}".`,
    );
  }
  const suffixId = reserveId(project, newId);
  const suffix: CodeNode = {
    ...newNode(project, suffixId, nodeId),
    fragment: node.fragment.slice(offset),
    childIds: [...node.childIds],
  };
  const nodes = {
    ...project.nodes,
    [nodeId]: {
      ...node,
      fragment: node.fragment.slice(0, offset),
      childIds: [suffixId],
    },
    [suffixId]: suffix,
  };

  for (const childId of node.childIds) {
    const child = requireNode(project, childId);
    nodes[childId] = { ...child, parentId: suffixId };
  }

  return { ...project, nodes };
}

export function getSubtreeIds(project: Project, nodeId: string): string[] {
  requireNode(project, nodeId);
  const ids: string[] = [];
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (visiting.has(id)) {
      throw new Error(`Cycle detected while reading the subtree at node "${id}".`);
    }
    visiting.add(id);
    ids.push(id);
    for (const childId of requireNode(project, id).childIds) {
      visit(childId);
    }
    visiting.delete(id);
  }

  visit(nodeId);
  return ids;
}

export function deleteSubtree(project: Project, nodeId: string): Project {
  const node = requireNode(project, nodeId);
  const removed = new Set(getSubtreeIds(project, nodeId));
  const remainingSiblings = siblingsOf(project, node).filter(
    (id) => id !== nodeId,
  );
  const nodes = Object.fromEntries(
    Object.entries(project.nodes)
      .filter(([id]) => !removed.has(id))
      .map(([id, current]) => {
        if (id !== node.parentId) {
          return [id, current];
        }
        return [id, { ...current, childIds: remainingSiblings }];
      }),
  );

  return {
    ...project,
    rootIds:
      node.parentId === null ? remainingSiblings : project.rootIds,
    nodes,
  };
}

export function getSiblingIds(project: Project, nodeId: string): string[] {
  return [...siblingsOf(project, requireNode(project, nodeId))];
}

export function getNodePath(project: Project, nodeId: string): CodeNode[] {
  const path: CodeNode[] = [];
  const visited = new Set<string>();
  let current: CodeNode | undefined = requireNode(project, nodeId);

  while (current) {
    if (visited.has(current.id)) {
      throw new Error(`Cycle detected in the parent path at node "${current.id}".`);
    }
    visited.add(current.id);
    path.push(current);
    current =
      current.parentId === null ? undefined : requireNode(project, current.parentId);
  }

  return path.reverse();
}
