import Editor, { type OnMount } from '@monaco-editor/react';
import { ExternalLink, Save } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { openFile, revealInCode, saveFile, updateBuffer } from '../../lib/actions';
import { languageFor, monaco } from '../../lib/monaco';
import { useTheme } from '../../lib/theme';
import { setState, useStore } from '../../lib/store';
import { Button, Notice } from '../../ui/primitives.jsx';

type MonacoEditor = Parameters<OnMount>[0];

/** Compact source editor for the selected element’s file, kept in the Inspector. */
export function ElementCodePanel() {
  const info = useStore((s) => s.sourceInfo);
  const sourceError = useStore((s) => s.sourceError);
  const buffers = useStore((s) => s.buffers);
  const theme = useTheme().resolved;
  const editorRef = useRef<MonacoEditor | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const buffer = info ? buffers[info.file] : null;
  const dirty = !!buffer && buffer.content !== buffer.saved;

  useEffect(() => {
    if (!info) return;
    void openFile(info.file, false);
  }, [info?.file]);

  useEffect(() => {
    if (!info || !editorRef.current || !buffer) return;
    const editor = editorRef.current;
    const line = Math.max(1, info.line);
    editor.layout();
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }, [info?.file, info?.line, buffer?.saved]);

  // Monaco needs a real pixel height; flex parents often report 0 until we measure + layout.
  useEffect(() => {
    const host = hostRef.current;
    const editor = editorRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      editorRef.current?.layout();
    });
    ro.observe(host);
    editor?.layout();
    return () => ro.disconnect();
  }, [!!buffer, info?.file]);

  if (sourceError) return <Notice>{sourceError}</Notice>;
  if (!info) {
    return <div className="empty-note">Select an element to edit its source.</div>;
  }

  return (
    <div className="inspector-code">
      <div className="inspector-code__toolbar">
        <button
          type="button"
          className="source-link"
          title={info.file}
          onClick={() => revealInCode(info.file, info.line)}
        >
          {info.file}:{info.line}
        </button>
        <div className="inspector-code__actions">
          <Button
            size="sm"
            variant="ghost"
            disabled={!dirty}
            icon={<Save size={13} />}
            onClick={() => void saveFile(info.file)}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<ExternalLink size={13} />}
            onClick={() => {
              setState({ mode: 'code' });
              revealInCode(info.file, info.line);
            }}
          >
            Full
          </Button>
        </div>
      </div>
      {buffer ? (
        <div className="inspector-code__editor" ref={hostRef}>
          <Editor
            height="100%"
            path={`inspector:${info.file}`}
            language={languageFor(info.file)}
            theme={theme === 'dark' ? 'oc-dark' : 'oc-light'}
            value={buffer.content}
            onChange={(value) => updateBuffer(info.file, value ?? '')}
            onMount={(editor) => {
              editorRef.current = editor;
              const model = editor.getModel();
              if (model && !buffer.saved.includes('\r\n')) model.setEOL(monaco.editor.EndOfLineSequence.LF);
              requestAnimationFrame(() => {
                editor.layout();
                const line = Math.max(1, info.line);
                editor.revealLineInCenter(line);
                editor.setPosition({ lineNumber: line, column: 1 });
              });
            }}
            options={{
              fontSize: 12,
              fontFamily: "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
              automaticLayout: true,
              renderLineHighlight: 'line',
              lineNumbers: 'on',
              folding: false,
              padding: { top: 8 },
              wordWrap: 'on',
              fixedOverflowWidgets: true,
            }}
          />
        </div>
      ) : (
        <div className="empty-note">Loading source…</div>
      )}
    </div>
  );
}
