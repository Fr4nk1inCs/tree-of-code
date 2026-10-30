import { createTheme } from '@mui/material/styles';
import { activateMonacoTheme, type MonacoThemeName } from './features/code/themes';

export function createAppTheme(themeName: MonacoThemeName) {
  const { colors, mode } = activateMonacoTheme(themeName);
  return createTheme({
    palette: {
      mode,
      primary: { main: colors.primary, contrastText: colors.background },
      secondary: { main: colors.secondary, contrastText: colors.background },
      success: { main: colors.success },
      warning: { main: colors.warning },
      error: { main: colors.error },
      background: { default: colors.background, paper: colors.surface },
      divider: colors.border,
      text: { primary: colors.text, secondary: colors.muted },
      action: {
        hover: colors.lineHighlight,
        selected: colors.selection,
        focus: colors.selection,
      },
    },
    typography: {
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            '--toc-background': colors.background,
            '--toc-surface': colors.surface,
            '--toc-editor': colors.editor,
            '--toc-text': colors.text,
            '--toc-muted': colors.muted,
            '--toc-border': colors.border,
            '--toc-primary': colors.primary,
            '--toc-line': colors.lineNumbers,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
      },
    },
  });
}
