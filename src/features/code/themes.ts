import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js';
import {
  IStandaloneThemeService,
  type StandaloneThemeService,
} from 'monaco-editor/esm/vs/editor/standalone/common/standaloneTheme.js';
import { monaco } from './monaco';

export const MONACO_THEMES = [
  { id: 'vs-dark', label: 'Dark' },
  { id: 'vs', label: 'Light' },
  { id: 'hc-black', label: 'High Contrast Dark' },
  { id: 'hc-light', label: 'High Contrast Light' },
] as const;

export type MonacoThemeName = (typeof MONACO_THEMES)[number]['id'];

export interface WebsiteColors {
  background: string;
  surface: string;
  editor: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  lineNumbers: string;
  lineHighlight: string;
  selection: string;
  cursor: string;
}

export function activateMonacoTheme(themeName: MonacoThemeName): {
  colors: WebsiteColors;
  mode: 'light' | 'dark';
} {
  monaco.editor.setTheme(themeName);
  const themeService = StandaloneServices.get<StandaloneThemeService>(IStandaloneThemeService);
  const colorTheme = themeService.getColorTheme();
  const color = (...ids: string[]): string => {
    for (const id of ids) {
      const value = colorTheme.getColor(id, true)?.toString();
      if (value) return value;
    }
    // Every requested group ends at a color defined by all Monaco built-in themes.
    throw new Error(`Monaco theme ${themeName} does not define ${ids.join(' or ')}.`);
  };

  return {
    mode: colorTheme.type === 'light' || colorTheme.type === 'hcLight' ? 'light' : 'dark',
    colors: {
      background: color('editor.background'),
      surface: color('editorWidget.background', 'input.background', 'editor.background'),
      editor: color('editor.background'),
      text: color('editor.foreground', 'foreground'),
      muted: color('descriptionForeground', 'editorLineNumber.foreground', 'foreground'),
      border: color('editorWidget.border', 'contrastBorder', 'input.border', 'descriptionForeground'),
      primary: color('focusBorder', 'editorInfo.foreground', 'foreground'),
      secondary: color('editorInfo.foreground', 'focusBorder', 'foreground'),
      success: color('editorGutter.addedBackground', 'editorInfo.foreground', 'foreground'),
      warning: color('editorWarning.foreground', 'foreground'),
      error: color('editorError.foreground', 'errorForeground', 'foreground'),
      lineNumbers: color('editorLineNumber.foreground', 'descriptionForeground', 'foreground'),
      lineHighlight: color('editor.lineHighlightBackground', 'editorWidget.background'),
      selection: color('editor.selectionBackground', 'editorWidget.background'),
      cursor: color('editorCursor.foreground', 'editor.foreground', 'foreground'),
    },
  };
}
