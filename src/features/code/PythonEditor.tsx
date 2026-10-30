import Editor, { type OnMount } from '@monaco-editor/react';
import { useRef } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useThemeStore } from '../../state/themeStore';
import './monaco';

interface PythonEditorProps {
  nodeId: string;
  code: string;
  height: number;
}

export function PythonEditor({ nodeId, code, height }: PythonEditorProps) {
  const setCursorOffset = useProjectStore((state) => state.setCursorOffset);
  const themeName = useThemeStore((state) => state.themeName);
  const ready = useRef(false);

  const handleMount: OnMount = (editor) => {
    ready.current = true;
    editor.onDidChangeCursorPosition((event) => {
      const model = editor.getModel();
      if (model) setCursorOffset(model.getOffsetAt(event.position));
    });
    editor.focus();
  };

  return (
    <Editor
      key={nodeId}
      height={height}
      language="python"
      theme={themeName}
      value={code}
      loading="Loading editor…"
      onMount={handleMount}
      onChange={(value) => {
        const state = useProjectStore.getState();
        if (ready.current && state.selectedNodeId === nodeId) {
          state.updateFragment(nodeId, value ?? '');
        }
      }}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        lineHeight: 20,
        lineNumbersMinChars: 3,
        padding: { top: 10, bottom: 10 },
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        tabSize: 4,
        wordWrap: 'off',
      }}
    />
  );
}
