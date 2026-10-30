import { Add } from '@mui/icons-material';
import { Button, Typography, useTheme } from '@mui/material';
import {
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { CodeNodeCard } from './CodeNodeCard';
import { layoutForest } from './layout';

const nodeTypes: NodeTypes = { code: CodeNodeCard };

function Canvas() {
  const project = useProjectStore((state) => state.project);
  const collapsedNodeIds = useProjectStore((state) => state.collapsedNodeIds);
  const annotationHeights = useProjectStore((state) => state.annotationHeights);
  const selectNode = useProjectStore((state) => state.selectNode);
  const addRoot = useProjectStore((state) => state.addRoot);
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId);
  const reactFlow = useReactFlow();
  const theme = useTheme();
  const nodesInitialized = useNodesInitialized();
  const { nodes, edges } = useMemo(
    () => layoutForest(project, collapsedNodeIds, annotationHeights),
    [project, collapsedNodeIds, annotationHeights],
  );
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    if (!selectedNodeId || !nodesInitialized) return;
    const selected = nodesRef.current.find((node) => node.id === selectedNodeId);
    if (!selected) return;
    const width = typeof selected.style?.width === 'number' ? selected.style.width : 500;
    const height = typeof selected.style?.height === 'number' ? selected.style.height : 400;
    void reactFlow.setCenter(
      selected.position.x + width / 2,
      selected.position.y + height / 2,
      { zoom: Math.max(reactFlow.getZoom(), 0.65), duration: 200 },
    );
  }, [selectedNodeId, nodesInitialized, reactFlow]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={theme.palette.mode}
        onlyRenderVisibleElements
        nodesDraggable={false}
        nodesConnectable={false}
        panActivationKeyCode={null}
        elementsSelectable={false}
        deleteKeyCode={null}
        minZoom={0.08}
        maxZoom={1.6}
        onNodeClick={(_, node) => selectNode(node.id)}
      >
        <Controls position="bottom-left" showInteractive={false} />
        {project.rootIds.length === 0 && (
          <Panel position="top-center" style={{ marginTop: '12vh' }}>
            <Typography variant="h5" gutterBottom>Start a forest</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Add a root, then grow and annotate its code fragments.
            </Typography>
            <Button variant="contained" startIcon={<Add />} onClick={addRoot}>
              Add root
            </Button>
          </Panel>
        )}
      </ReactFlow>
    </>
  );
}

export function ForestCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
