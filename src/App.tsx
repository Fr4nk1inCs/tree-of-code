import { Box } from '@mui/material';
import { ForestCanvas } from './features/canvas/ForestCanvas';
import { ProjectToolbar } from './features/project/ProjectToolbar';

export function App() {
  return (
    <Box sx={{ height: '100dvh', minWidth: 320, overflow: 'hidden' }}>
      <ProjectToolbar />
      <Box component="main" sx={{ height: 'calc(100dvh - 64px)' }}>
        <ForestCanvas />
      </Box>
    </Box>
  );
}
