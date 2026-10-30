import Editor from '@monaco-editor/react';
import { useThemeStore } from '../../state/themeStore';
import './monaco';

interface JsonEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
}

export function JsonEditor({ label, value, onChange, height = 420 }: JsonEditorProps) {
  const themeName = useThemeStore((state) => state.themeName);
  return (
    <Editor
      height={height}
      language="json"
      theme={themeName}
      value={value}
      loading="Loading editor…"
      onMount={(editor) => editor.focus()}
      onChange={(nextValue) => onChange(nextValue ?? '')}
      options={{
        ariaLabel: label,
        autoClosingBrackets: 'never',
        autoClosingQuotes: 'never',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineHeight: 20,
        lineNumbersMinChars: 3,
        padding: { top: 10, bottom: 10 },
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        tabSize: 2,
        wordWrap: 'on',
      }}
    />
  );
}
