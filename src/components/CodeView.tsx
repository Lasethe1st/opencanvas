import Editor, { type OnMount } from '@monaco-editor/react';
import { Eye, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { closeFile, saveFile, updateBuffer } from '../lib/actions';
import { languageFor, monaco } from '../lib/monaco';
import { setState, useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { CodeTab, CodeView as CodeShell } from '../ui/CodeView.jsx';
import { IconButton } from '../ui/primitives.jsx';

type Editor = Parameters<OnMount>[0];

export function CodeView({ hidden }: { hidden: boolean }) {
  const activeFile = useStore((s) => s.activeFile);
  const openFiles = useStore((s) => s.openFiles);
  const buffers = useStore((s) => s.buffers);
  const revealLine = useStore((s) => s.revealLine);
  const theme = useTheme().resolved;
  const editorRef = useRef<Editor | null>(null);
  const [problems, setProblems] = useState<{ count: number; first: string | null }>({ count: 0, first: null });
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const buffer = activeFile ? buffers[activeFile] : null;
  const dirty = !!buffer && buffer.content !== buffer.saved;

  useEffect(() => {
    const sub = monaco.editor.onDidChangeMarkers(() => {
      const model = editorRef.current?.getModel();
      if (!model) return;
      const markers = monaco.editor.getModelMarkers({ resource: model.uri }).filter((m) => m.severity === monaco.MarkerSeverity.Error);
      setProblems({ count: markers.length, first: markers[0] ? `Line ${markers[0].startLineNumber}: ${markers[0].message}` : null });
    });
    return () => sub.dispose();
  }, []);

  useEffect(() => {
    if (!revealLine || revealLine.file !== activeFile || !editorRef.current || hidden) return;
    const editor = editorRef.current;
    setTimeout(() => {
      editor.revealLineInCenter(revealLine.line);
      editor.setPosition({ lineNumber: revealLine.line, column: 1 });
      editor.focus();
    }, 30);
    setState({ revealLine: null });
  }, [revealLine, activeFile, hidden]);

  useEffect(() => {
    if (!hidden) editorRef.current?.layout();
  }, [hidden]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && buffer && !buffer.saved.includes('\r\n')) model.setEOL(monaco.editor.EndOfLineSequence.LF);
  }, [activeFile, buffer?.saved]);

  return (
    <CodeShell
      style={hidden ? { display: 'none' } : undefined}
      tabs={openFiles.map((file) => {
        const b = buffers[file];
        return (
          <CodeTab
            key={file}
            name={file.split('/').pop()!}
            title={file}
            active={file === activeFile}
            dirty={!!b && b.content !== b.saved}
            onSelect={() => setState({ activeFile: file })}
            onClose={() => closeFile(file)}
          />
        );
      })}
      actions={
        <>
          <IconButton size="sm" label="Save (Ctrl+S)" onClick={() => void saveFile()} disabled={!dirty}>
            <Save size={13} />
          </IconButton>
          <IconButton size="sm" label="Back to visual editor" onClick={() => setState({ mode: 'visual' })}>
            <Eye size={13} />
          </IconButton>
        </>
      }
      editor={
        activeFile && buffer ? (
          <Editor
            path={activeFile}
            language={languageFor(activeFile)}
            theme={theme === 'dark' ? 'oc-dark' : 'oc-light'}
            value={buffer.content}
            onChange={(value) => updateBuffer(activeFile, value ?? '')}
            onMount={(editor) => {
              editorRef.current = editor;
              const model = editor.getModel();
              if (model && !buffer.saved.includes('\r\n')) model.setEOL(monaco.editor.EndOfLineSequence.LF);
              editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, column: e.position.column }));
            }}
            options={{
              fontSize: 12.5,
              fontFamily: "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
              automaticLayout: true,
              renderLineHighlight: 'line',
              padding: { top: 12 },
            }}
          />
        ) : (
          <div className="empty-note">Open a file from the Files panel to edit it.</div>
        )
      }
      status={
        <>
          <span className="code-status__file">{activeFile ?? 'No file'}</span>
          {activeFile && <span>{dirty ? 'Unsaved changes' : 'Saved'}</span>}
          {problems.count > 0 && (
            <span className="is-error" title={problems.first ?? ''}>
              {problems.count} syntax error{problems.count > 1 ? 's' : ''}: {problems.first}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>
            Ln {cursor.line}, Col {cursor.column}
          </span>
        </>
      }
    />
  );
}
