import dagre from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { CodeNode, Project } from '../../model/project';

export const CARD_WIDTH = 500;
const NODE_GAP = 36;

function preserveSiblingOrder(nodes: CodeFlowNode[], project: Project): void {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const heightOf = (id: string) => {
    const height = nodesById.get(id)?.style?.height;
    return typeof height === 'number' ? height : 0;
  };
  const boundsOf = (id: string): { minY: number; maxY: number } => {
    let minY = Infinity;
    let maxY = -Infinity;
    const visit = (currentId: string) => {
      const current = nodesById.get(currentId)!;
      minY = Math.min(minY, current.position.y);
      maxY = Math.max(maxY, current.position.y + heightOf(currentId));
      project.nodes[currentId].childIds.forEach(visit);
    };
    visit(id);
    return { minY, maxY };
  };
  const shiftSubtree = (id: string, deltaY: number) => {
    nodesById.get(id)!.position.y += deltaY;
    project.nodes[id].childIds.forEach((childId) => shiftSubtree(childId, deltaY));
  };
  const order = (ids: string[]) => {
    for (const id of ids) order(project.nodes[id].childIds);
    if (ids.length > 1) {
      const bounds = new Map(ids.map((id) => [id, boundsOf(id)]));
      let cursor = Math.min(...[...bounds.values()].map((bound) => bound.minY));
      for (const id of ids) {
        const bound = bounds.get(id)!;
        shiftSubtree(id, cursor - bound.minY);
        cursor += bound.maxY - bound.minY + NODE_GAP;
      }
    }
  };
  order(project.rootIds);
}

export interface CardMetrics {
  codeHeight: number;
  annotationHeight: number;
  height: number;
}

export type CodeFlowNode = Node<{ nodeId: string }, 'code'>;

export function getCardMetrics(
  project: Project,
  node: CodeNode,
  collapsed: boolean,
  measuredAnnotationHeight?: number,
): CardMetrics {
  const lineCount = Math.max(1, node.fragment.split('\n').length);
  const codeHeight = Math.min(260, Math.max(76, lineCount * 20 + 20));
  const fieldCount = Object.keys(project.schema.properties ?? {}).length;
  const estimatedAnnotationHeight = Math.max(16, fieldCount * 48 + 16);
  const annotationHeight = collapsed
    ? 0
    : Math.max(0, measuredAnnotationHeight ?? estimatedAnnotationHeight);
  return {
    codeHeight,
    annotationHeight,
    height: 48 + codeHeight + 34 + annotationHeight,
  };
}

export function layoutForest(
  project: Project,
  collapsedNodeIds: Record<string, boolean>,
  annotationHeights: Record<string, number> = {},
): { nodes: CodeFlowNode[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_GAP, ranksep: 110, marginx: 40, marginy: 40 });
  graph.setDefaultEdgeLabel(() => ({}));

  const edges: Edge[] = [];
  const orderedNodes: CodeNode[] = [];
  const visit = (nodeId: string) => {
    const node = project.nodes[nodeId];
    orderedNodes.push(node);
    node.childIds.forEach(visit);
  };
  project.rootIds.forEach(visit);

  for (const node of orderedNodes) {
    const metrics = getCardMetrics(
      project,
      node,
      Boolean(collapsedNodeIds[node.id]),
      annotationHeights[node.id],
    );
    graph.setNode(node.id, { width: CARD_WIDTH, height: metrics.height });
    for (const childId of node.childIds) {
      graph.setEdge(node.id, childId);
      edges.push({
        id: `${node.id}-${childId}`,
        source: node.id,
        target: childId,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--toc-line)' },
      });
    }
  }

  dagre.layout(graph);

  const nodes = project.rootIds.length === 0 ? [] : orderedNodes.map((node) => {
    const position = graph.node(node.id);
    const metrics = getCardMetrics(
      project,
      node,
      Boolean(collapsedNodeIds[node.id]),
      annotationHeights[node.id],
    );
    return {
      id: node.id,
      type: 'code' as const,
      position: { x: position.x - CARD_WIDTH / 2, y: position.y - metrics.height / 2 },
      data: { nodeId: node.id },
      style: { width: CARD_WIDTH, height: metrics.height },
      draggable: false,
      connectable: false,
    };
  });

  preserveSiblingOrder(nodes, project);
  return { nodes, edges };
}
