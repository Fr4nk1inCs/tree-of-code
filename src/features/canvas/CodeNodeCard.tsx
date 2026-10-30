import { Edit, PlayArrow } from '@mui/icons-material';
import { Box, Card, Collapse, IconButton, InputBase, Typography } from '@mui/material';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { AnnotationJsonDialog } from '../annotations/AnnotationJsonDialog';
import { AnnotationView } from '../annotations/AnnotationView';
import { PythonEditor } from '../code/PythonEditor';
import { PythonPreview } from '../code/PythonPreview';
import { useProjectStore } from '../../state/projectStore';
import { getFragmentTitle } from '../../model/project';
import { getCardMetrics, type CodeFlowNode } from './layout';
import { NodeActions } from './NodeActions';

export function CodeNodeCard({ data }: NodeProps<CodeFlowNode>) {
  const nodeId = data.nodeId;
  const node = useProjectStore((state) => state.project.nodes[nodeId]);
  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selectedNodeId === nodeId);
  const collapsed = useProjectStore((state) => Boolean(state.collapsedNodeIds[nodeId]));
  const annotationHeight = useProjectStore((state) => state.annotationHeights[nodeId]);
  const selectNode = useProjectStore((state) => state.selectNode);
  const updateTitle = useProjectStore((state) => state.updateTitle);
  const toggleAnnotations = useProjectStore((state) => state.toggleAnnotations);
  const setAnnotationHeight = useProjectStore((state) => state.setAnnotationHeight);
  const annotationRef = useRef<HTMLDivElement>(null);
  const [annotationEditorOpen, setAnnotationEditorOpen] = useState(false);

  useLayoutEffect(() => {
    const element = annotationRef.current;
    if (!element || collapsed) return;
    const measure = () => {
      const height = element.offsetHeight;
      if (height > 0) setAnnotationHeight(nodeId, height);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [collapsed, nodeId, setAnnotationHeight]);

  if (!node) return null;

  const metrics = getCardMetrics(project, node, collapsed, annotationHeight);
  const title = getFragmentTitle(node);

  return (
    <Card
      variant="outlined"
      className="nodrag nopan"
      onClick={() => selectNode(nodeId)}
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderColor: selected ? 'primary.main' : 'divider',
        boxShadow: selected
          ? (theme) => `0 0 0 1px ${theme.palette.primary.main}`
          : 'none',
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
      <Box sx={{ height: 48, px: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <InputBase
          value={node.title}
          placeholder={title}
          title={title}
          onChange={(event) => updateTitle(nodeId, event.target.value)}
          inputProps={{ 'aria-label': 'Fragment title' }}
          sx={{
            minWidth: 0,
            flex: 1,
            px: 0.5,
            fontSize: 14,
            fontWeight: 600,
            '& input': { p: 0, textOverflow: 'ellipsis' },
          }}
        />
        <NodeActions nodeId={nodeId} />
      </Box>

      {selected ? (
        <PythonEditor nodeId={nodeId} code={node.fragment} height={metrics.codeHeight} />
      ) : (
        <PythonPreview code={node.fragment} height={metrics.codeHeight} />
      )}

      <Box
        onClick={(event) => { event.stopPropagation(); toggleAnnotations(nodeId); }}
        sx={{
          height: 34,
          px: 1,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          borderTop: 1,
          borderBottom: collapsed ? 0 : 1,
          borderColor: 'divider',
        }}
      >
        <IconButton
          size="small"
          aria-label={collapsed ? 'Expand annotation' : 'Collapse annotation'}
          sx={{ p: 0.25 }}
        >
          <PlayArrow
            sx={{
              fontSize: 10,
              transform: collapsed ? 'none' : 'rotate(90deg)',
              transition: 'transform 120ms',
            }}
          />
        </IconButton>
        <Typography variant="body2" sx={{ ml: 0.5, flex: 1, fontSize: 12, fontWeight: 600 }}>Annotation</Typography>
        <IconButton
          size="small"
          aria-label="Edit annotation JSON"
          onClick={(event) => {
            event.stopPropagation();
            selectNode(nodeId);
            setAnnotationEditorOpen(true);
          }}
          sx={{ p: 0.25 }}
        >
          <Edit sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
      <Collapse in={!collapsed} timeout={0} unmountOnExit>
        <Box ref={annotationRef} data-annotation-content sx={{ p: 1 }}>
          <AnnotationView nodeId={nodeId} />
        </Box>
      </Collapse>
      <AnnotationJsonDialog
        nodeId={nodeId}
        open={annotationEditorOpen}
        onClose={() => setAnnotationEditorOpen(false)}
      />
    </Card>
  );
}
