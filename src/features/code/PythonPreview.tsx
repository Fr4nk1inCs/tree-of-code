import { useEffect, useRef } from 'react';
import { useThemeStore } from '../../state/themeStore';
import { monaco } from './monaco';

interface PythonPreviewProps {
  code: string;
  height: number;
}

export function PythonPreview({ code, height }: PythonPreviewProps) {
  const ref = useRef<HTMLPreElement>(null);
  const themeName = useThemeStore((state) => state.themeName);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.textContent = code;
    void monaco.editor.colorizeElement(element, {
      theme: themeName,
      mimeType: 'python',
      tabSize: 4,
    });
  }, [code, themeName]);

  return (
    <pre
      ref={ref}
      className="code-preview nodrag nopan nowheel"
      data-lang="python"
      aria-label="Python code preview"
      style={{ height }}
    >
      {code}
    </pre>
  );
}
