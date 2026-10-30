import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { getSchemaValidationErrors } from '../../model/schema';
import { useProjectStore } from '../../state/projectStore';
import { JsonEditor } from '../code/JsonEditor';
import type { RJSFSchema } from '@rjsf/utils';

interface SchemaDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SchemaDialog({ open, onClose }: SchemaDialogProps) {
  const schema = useProjectStore((state) => state.project.schema);
  const updateSchema = useProjectStore((state) => state.updateSchema);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setText(JSON.stringify(schema, null, 2));
      setErrors([]);
    }
  }, [open, schema]);

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
      return;
    }
    const validationErrors = getSchemaValidationErrors(parsed);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    updateSchema(parsed as RJSFSchema);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Project annotation schema</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Every node uses this schema for its static annotation view and JSON validation.
          Supported fields are strings, multiline strings (format: textarea), numbers,
          integers, booleans, scalar enums, nested objects, and arrays with an items schema.
          All fields are optional.
        </Typography>
        {open && (
          <Box sx={{ height: 480, border: 1, borderColor: 'divider' }}>
            <JsonEditor label="Raw JSON Schema" value={text} onChange={setText} height="100%" />
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
        <Button onClick={apply} variant="contained">Apply schema</Button>
      </DialogActions>
    </Dialog>
  );
}
