import {
  Add,
  ArrowDownward,
  ArrowUpward,
  ContentCut,
  Delete,
  DriveFileMove,
  MoreVert,
  VerticalAlignTop,
} from '@mui/icons-material';
import {
  Button,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { getFragmentTitle } from '../../model/project';
import { getSiblingIds, getSubtreeIds } from '../../model/tree';
import { useProjectStore } from '../../state/projectStore';

interface NodeActionsProps {
  nodeId: string;
}

export function NodeActions({ nodeId }: NodeActionsProps) {
  const project = useProjectStore((state) => state.project);
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId);
  const cursorOffset = useProjectStore((state) => state.editorCursorOffset);
  const addChild = useProjectStore((state) => state.addChild);
  const reorder = useProjectStore((state) => state.reorder);
  const reparent = useProjectStore((state) => state.reparent);
  const split = useProjectStore((state) => state.split);
  const remove = useProjectStore((state) => state.remove);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [reparentOpen, setReparentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const node = project.nodes[nodeId];
  if (!node) return null;

  const siblings = getSiblingIds(project, nodeId);
  const siblingIndex = siblings.indexOf(nodeId);
  const subtree = new Set(getSubtreeIds(project, nodeId));
  const candidates = Object.values(project.nodes).filter((candidate) => !subtree.has(candidate.id));
  const labelFor = (id: string) => getFragmentTitle(project.nodes[id]);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Box onClick={(event) => event.stopPropagation()} sx={{ display: 'flex', alignItems: 'center' }}>
      <Tooltip title="Add child">
        <IconButton size="small" aria-label="Add child" onClick={() => addChild(nodeId)}>
          <Add fontSize="small" />
        </IconButton>
      </Tooltip>
      <IconButton
        size="small"
        aria-label="Node actions"
        onClick={(event) => setMenuAnchor(event.currentTarget)}
      >
        <MoreVert fontSize="small" />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          disabled={selectedNodeId !== nodeId}
          onClick={() => { split(nodeId, cursorOffset); closeMenu(); }}
        >
          <ListItemIcon><ContentCut fontSize="small" /></ListItemIcon>
          <ListItemText>Split at cursor</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setTargetId(''); setReparentOpen(true); closeMenu(); }}>
          <ListItemIcon><DriveFileMove fontSize="small" /></ListItemIcon>
          <ListItemText>Reparent…</ListItemText>
        </MenuItem>
        {node.parentId !== null && (
          <MenuItem onClick={() => { reparent(nodeId, null); closeMenu(); }}>
            <ListItemIcon><VerticalAlignTop fontSize="small" /></ListItemIcon>
            <ListItemText>Move to root</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          disabled={siblingIndex <= 0}
          onClick={() => { reorder(nodeId, -1); closeMenu(); }}
        >
          <ListItemIcon><ArrowUpward fontSize="small" /></ListItemIcon>
          <ListItemText>Move earlier</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={siblingIndex === siblings.length - 1}
          onClick={() => { reorder(nodeId, 1); closeMenu(); }}
        >
          <ListItemIcon><ArrowDownward fontSize="small" /></ListItemIcon>
          <ListItemText>Move later</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setDeleteOpen(true); closeMenu(); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete subtree</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={reparentOpen} onClose={() => setReparentOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Choose a new parent</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The complete subtree moves with this fragment.
          </Typography>
          <TextField
            select
            autoFocus
            fullWidth
            label="New parent"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {candidates.map((candidate) => (
              <MenuItem key={candidate.id} value={candidate.id}>{labelFor(candidate.id)}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReparentOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!targetId}
            onClick={() => { reparent(nodeId, targetId); setReparentOpen(false); }}
          >
            Reparent
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs">
        <DialogTitle>Delete this subtree?</DialogTitle>
        <DialogContent>
          <Typography>
            {subtree.size === 1
              ? 'This fragment and its annotations will be removed.'
              : `${subtree.size} fragments and their annotations will be removed.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { remove(nodeId); setDeleteOpen(false); }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
