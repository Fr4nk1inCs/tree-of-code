import {
  AccountTree,
  Add,
  FileOpen,
  NoteAdd,
  Save,
  Schema,
} from '@mui/icons-material';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../model/project';
import { parseProjectFile, serializeProject, validateProject } from '../../model/projectFile';
import { useProjectStore } from '../../state/projectStore';
import { useThemeStore } from '../../state/themeStore';
import { MONACO_THEMES, type MonacoThemeName } from '../code/themes';
import { SchemaDialog } from '../annotations/SchemaDialog';

type PendingReplacement = { kind: 'new' } | { kind: 'open'; project: Project };

export function ProjectToolbar() {
  const project = useProjectStore((state) => state.project);
  const dirty = useProjectStore((state) => state.dirty);
  const draftStatus = useProjectStore((state) => state.draftStatus);
  const draftError = useProjectStore((state) => state.draftError);
  const newProject = useProjectStore((state) => state.newProject);
  const openProject = useProjectStore((state) => state.openProject);
  const markSaved = useProjectStore((state) => state.markSaved);
  const addRoot = useProjectStore((state) => state.addRoot);
  const themeName = useThemeStore((state) => state.themeName);
  const setThemeName = useThemeStore((state) => state.setThemeName);
  const fileInput = useRef<HTMLInputElement>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [pending, setPending] = useState<PendingReplacement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (draftError) setError(draftError);
  }, [draftError]);

  const requestNew = () => {
    if (dirty) setPending({ kind: 'new' });
    else newProject();
  };

  const readProject = async (file: File) => {
    try {
      const opened = parseProjectFile(await file.text());
      if (dirty) setPending({ kind: 'open', project: opened });
      else openProject(opened);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const confirmReplacement = () => {
    if (!pending) return;
    if (pending.kind === 'new') newProject();
    else openProject(pending.project);
    setPending(null);
  };

  const save = () => {
    const errors = validateProject(project);
    if (errors.length > 0) {
      setError(`Fix the project before saving: ${errors.join(' ')}`);
      return;
    }
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tree-of-code.project.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    markSaved();
    setNotice('Project file saved. The current draft also remains in this browser.');
  };

  const status = draftStatus === 'loading'
    ? 'Loading draft…'
    : draftStatus === 'saving'
      ? 'Saving draft…'
      : draftStatus === 'error'
        ? 'Draft save failed'
        : dirty
          ? 'Draft saved · file changes unsaved'
          : 'Draft saved · file saved';

  return (
    <>
      <AppBar
        position="static"
        elevation={0}
        color="default"
        sx={{ bgcolor: 'background.paper', color: 'text.primary', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ height: 64, minHeight: '64px !important', gap: 1, overflowX: 'auto' }}>
          <AccountTree color="primary" sx={{ mr: 0.5 }} />
          <Typography variant="h6" sx={{ whiteSpace: 'nowrap', mr: 1 }}>Tree of Code</Typography>
          <Tooltip title={draftError ?? status}>
            <Typography
              variant="caption"
              color={draftStatus === 'error' ? 'error' : dirty ? 'warning.main' : 'text.secondary'}
              sx={{ whiteSpace: 'nowrap', mr: 1 }}
            >
              {status}
            </Typography>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 8 }} />
          <FormControl size="small" sx={{ minWidth: 132 }}>
            <InputLabel id="monaco-theme-label">Theme</InputLabel>
            <Select
              labelId="monaco-theme-label"
              label="Theme"
              value={themeName}
              onChange={(event) => setThemeName(event.target.value as MonacoThemeName)}
            >
              {MONACO_THEMES.map((theme) => (
                <MenuItem key={theme.id} value={theme.id}>{theme.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button color="inherit" size="small" startIcon={<NoteAdd />} onClick={requestNew}>New</Button>
          <Button color="inherit" size="small" startIcon={<FileOpen />} onClick={() => fileInput.current?.click()}>Open</Button>
          <Button color="inherit" size="small" startIcon={<Save />} onClick={save}>Save</Button>
          <Button color="inherit" size="small" startIcon={<Schema />} onClick={() => setSchemaOpen(true)}>Schema</Button>
          <Button variant="contained" size="small" startIcon={<Add />} onClick={addRoot}>Add root</Button>
        </Toolbar>
      </AppBar>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readProject(file);
          event.target.value = '';
        }}
      />
      <SchemaDialog open={schemaOpen} onClose={() => setSchemaOpen(false)} />

      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} maxWidth="xs">
        <DialogTitle>Replace the current project?</DialogTitle>
        <DialogContent>
          <Typography>Your unsaved file changes will be replaced. The local draft will be overwritten.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmReplacement}>Replace</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(error)} autoHideDuration={7000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice(null)}>
        <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert>
      </Snackbar>
    </>
  );
}
