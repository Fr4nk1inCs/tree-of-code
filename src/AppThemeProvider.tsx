import { CssBaseline, ThemeProvider } from '@mui/material';
import { useMemo, type ReactNode } from 'react';
import { createAppTheme } from './theme';
import { useThemeStore } from './state/themeStore';

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const themeName = useThemeStore((state) => state.themeName);
  const theme = useMemo(() => createAppTheme(themeName), [themeName]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
