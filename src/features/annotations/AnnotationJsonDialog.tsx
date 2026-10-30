import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { validateAnnotationValues } from '../../model/schema';
import type { AnnotationValues } from '../../model/project';
import { useProjectStore } from '../../state/projectStore';
import { JsonEditor } from '../code/JsonEditor';

interface AnnotationJsonDialogProps {
  nodeId: string;
  open: boolean;
  onClose: () => void;
}

export function AnnotationJsonDialog({ nodeId, open, onClose }: AnnotationJsonDialogProps) {
  const schema = useProjectStore((state) => state.project.schema);
  const annotations = useProjectStore((state) => state.project.nodes[nodeId]?.annotations ?? {});
  const updateAnnotations = useProjectStore((state) => state.updateAnnotations);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setText(JSON.stringify(annotations, null, 2));
      setErrors([]);
    }
  }, [open, annotations]);

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
      return;
    }
    const validationErrors = validateAnnotationValues(schema, parsed);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    updateAnnotations(nodeId, parsed as AnnotationValues);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Fragment annotations</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Edit the JSON values for this fragment. The static annotation view updates after valid JSON is applied.
        </Typography>
        {open && (
          <Box sx={{ height: 420, border: 1, borderColor: 'divider' }}>
            <JsonEditor label="Annotation JSON" value={text} onChange={setText} height="100%" />
          </Box>
        )}
        {errors.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {errors.map((error) => <li key={error}>{error}</li>)}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={apply} variant="contained">Apply annotations</Button>
      </DialogActions>
    </Dialog>
  );
}
