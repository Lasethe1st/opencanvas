import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { CodeView } from './components/CodeView';
import { ExportDialog } from './components/ExportDialog';
import { Inspector } from './components/Inspector';
import { LeftSidebar } from './components/LeftSidebar';
import { Onboarding } from './components/Onboarding';
import { Toasts } from './components/Toasts';
import { ToolRail } from './components/ToolRail';
import { TopBar } from './components/TopBar';
import { refreshSourceInfo, refreshTree, reloadProjectConfig, saveFile, syncBuffersFromDisk } from './lib/actions';
import { api } from './lib/api';
import { handleExternalChange } from './lib/inline-edit';
import { handleShortcut } from './lib/shortcuts';
import { getState, setState, useStore } from './lib/store';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !!target.closest('.monaco-editor');
}

export default function App() {
  const project = useStore((s) => s.project);
  const mode = useStore((s) => s.mode);

  useEffect(() => {
    const offStatus = api.onPreviewStatus((status) => setState({ previewStatus: status }));
    const offLog = api.onInstallLog((text) => setState((s) => ({ installLog: (s.installLog + text).slice(-8000) })));
    const offFiles = api.onFilesChanged((paths) => {
      void handleExternalChange(paths);
      void refreshTree();
      void syncBuffersFromDisk(paths);
      if (paths.some((p) => p === 'package.json' || /^vite\.config\.[cm]?[jt]s$/.test(p))) void reloadProjectConfig();
      if (getState().selection) void refreshSourceInfo();
    });
    void api.previewStatus().then((status) => setState({ previewStatus: status }));
    return () => {
      offStatus();
      offLog();
      offFiles();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveFile();
        return;
      }
      if (isTyping(event.target)) return;
      if (handleShortcut(event.key, meta, event.shiftKey, event.altKey)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    );
  }

  return (
    <div className="shell">
      <TopBar />
      <div className="workspace">
        {mode === 'visual' && <ToolRail />}
        <LeftSidebar />
        <Canvas hidden={mode !== 'visual'} />
        <CodeView hidden={mode !== 'code'} />
        {mode === 'visual' && <Inspector />}
      </div>
      <ExportDialog />
      <Toasts />
    </div>
  );
}
