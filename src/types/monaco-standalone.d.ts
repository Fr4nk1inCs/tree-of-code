declare module 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js' {
  export const StandaloneServices: {
    get<T>(identifier: unknown): T;
  };
}

declare module 'monaco-editor/esm/vs/editor/standalone/common/standaloneTheme.js' {
  interface MonacoColor {
    toString(): string;
  }

  export interface MonacoColorTheme {
    type: 'light' | 'dark' | 'hcDark' | 'hcLight';
    getColor(colorId: string, useDefault?: boolean): MonacoColor | undefined;
  }

  export interface StandaloneThemeService {
    getColorTheme(): MonacoColorTheme;
  }

  export const IStandaloneThemeService: unknown;
}
