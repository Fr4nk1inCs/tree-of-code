import '@xyflow/react/dist/style.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppThemeProvider } from './AppThemeProvider';
import { useProjectStore } from './state/projectStore';

void useProjectStore.getState().initialize();

createRoot(document.getElementById('root')!).render(
  <AppThemeProvider>
    <App />
  </AppThemeProvider>,
);
