import { useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { BugCheckPanel } from './components/BugCheck';
import { CodeView } from './components/CodeView';
import { ExportDialog } from './components/ExportDialog';
import { ImportSummaryDialog } from './components/ImportSummary';
import { FullPreview } from './components/FullPreview';
import { GitPanel } from './components/GitMenu';
import { SettingsPage } from './components/Settings';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Inspector } from './components/Inspector';
import { LeftSidebar } from './components/LeftSidebar';
import { Onboarding } from './components/Onboarding';
import { Toasts } from './components/Toasts';
import { ToolRail } from './components/ToolRail';
import { TopBar } from './components/TopBar';
import { handleMcpRequest, recordExternalEdit, refreshSourceInfo, refreshTree, reloadProjectConfig, saveFile, syncBuffersFromDisk } from './lib/actions';
import { handleAiEvent, refreshAiStatus } from './lib/ai';
import { api } from './lib/api';
import { handleExternalChange } from './lib/inline-edit';
import { loadProjectConfig, touchesConfig } from './lib/pages';
import { handleShortcut } from './lib/shortcuts';
import { loadPanels } from './lib/panels';
import { getState, setState, useStore } from './lib/store';
import { initTerminals, toggleTerminal } from './lib/terminal';
import { TerminalPanel } from './components/TerminalPanel';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !!target.closest('.monaco-editor');
}

export default function App() {
  const project = useStore((s) => s.project);
  const mode = useStore((s) => s.mode);
  const auditOpen = useStore((s) => s.auditOpen);
  const gitOpen = useStore((s) => s.gitOpen);

  useEffect(() => {
    const offStatus = api.onPreviewStatus((status) => setState({ previewStatus: status }));
    const offLog = api.onInstallLog((text) => setState((s) => ({ installLog: (s.installLog + text).slice(-8000) })));
    const offFiles = api.onFilesChanged((paths) => {
      void handleExternalChange(paths);
      void refreshTree();
      void syncBuffersFromDisk(paths);
      if (paths.some((p) => p === 'package.json' || /^vite\.config\.[cm]?[jt]s$/.test(p))) void reloadProjectConfig();
      if (touchesConfig(paths)) void loadProjectConfig();
      if (getState().selection) void refreshSourceInfo();
    });
    void api.previewStatus().then((status) => setState({ previewStatus: status }));
    const offMcpStatus = api.mcp.onStatus((status) => setState({ mcp: status }));
    const offMcpApplied = api.mcp.onApplied((applied) => {
      if (getState().project) recordExternalEdit(applied);
    });
    const offMcpRequest = api.mcp.onRequest(handleMcpRequest);
    void api.mcp.status().then((status) => setState({ mcp: status }));
    const offAi = api.ai.onEvent(handleAiEvent);
    void refreshAiStatus();
    const offVariants = api.variants.onChanged((variants) => setState({ variants }));
    void api.variants.list().then((variants) => setState({ variants })).catch(() => undefined);
    const offTerminals = initTerminals();
    return () => {
      offAi();
      offVariants();
      offTerminals();
      offStatus();
      offLog();
      offFiles();
      offMcpStatus();
      offMcpApplied();
      offMcpRequest();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key === '`' && getState().project) {
        event.preventDefault();
        toggleTerminal();
        return;
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveFile();
        return;
      }
      if (meta && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        handleShortcut(event.key, meta, event.shiftKey, false);
        return;
      }
      if (isTyping(event.target)) return;
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;
      // Tab keeps moving focus between controls; it only walks the element tree from the canvas.
      if (event.key === 'Tab' && event.target instanceof HTMLElement && event.target !== document.body && !event.target.closest('.stage')) return;
      if (event.key === 'Escape' && document.querySelector('.dialog-backdrop, .menu, .popover, .git-panel, .settings-page, .full-preview, .font-menu, .tool-flyout, .audit-panel')) return;
      if (handleShortcut(event.key, meta, event.shiftKey, event.altKey)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A file dropped anywhere that doesn't accept it would otherwise navigate the window to that file.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const projectRoot = project?.root;
  useEffect(() => {
    if (projectRoot) loadPanels();
  }, [projectRoot]);
  const panelsHidden = useStore((s) => s.panelsHidden);
  const focus = mode === 'visual' && panelsHidden.left && panelsHidden.right;

  const workspaceRef = useFloatingInsets(mode === 'visual' && !!project, !!project);

  if (!project) {
    return (
      <>
        <Onboarding />
        <SettingsPage />
        <ShortcutsDialog />
        <Toasts />
      </>
    );
  }

  return (
    <div className="shell">
      <TopBar />
      <div className={`workspace${mode === 'visual' ? ' workspace--bleed' : ''}${focus ? ' is-focus' : ''}`} ref={workspaceRef}>
        <ToolRail />
        {gitOpen ? <GitPanel /> : <LeftSidebar />}
        <div className="workspace__center">
          <Canvas hidden={mode !== 'visual'} />
          <CodeView hidden={mode !== 'code'} />
          <TerminalPanel />
        </div>
        {auditOpen ? <BugCheckPanel /> : mode === 'visual' && <Inspector />}
        <SettingsPage />
      </div>
      <FullPreview />
      <ExportDialog />
      <ImportSummaryDialog />
      <ShortcutsDialog />
      <Toasts />
    </div>
  );
}

/**
 * In the full-bleed canvas the side chrome floats over the stage. Publish how much of each edge it covers
 * as --inset-l / --inset-r on the canvas area, so fit-to-frames and the bottom chrome can stay clear of it.
 */
function useFloatingInsets(active: boolean, mounted: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ws = ref.current;
    if (!ws) return;
    const center = ws.querySelector<HTMLElement>('.workspace__center');
    if (!center) return;
    const shell = ws.parentElement;
    const update = () => {
      // The top bar's two pills never grow wider than the side panel beneath each of them.
      if (shell) {
        const box = ws.getBoundingClientRect();
        let leftPanel = 0;
        let rightPanel = 0;
        for (const el of ws.querySelectorAll<HTMLElement>(':scope > .panel')) {
          const r = el.getBoundingClientRect();
          if (!r.width) continue;
          if (r.left + r.width / 2 < box.left + box.width / 2) leftPanel = Math.max(leftPanel, r.width);
          else rightPanel = Math.max(rightPanel, r.width);
        }
        for (const [name, width] of [['--pill-l-max', leftPanel], ['--pill-r-max', rightPanel]] as const) {
          if (width) shell.style.setProperty(name, `${Math.floor(width)}px`);
          else shell.style.removeProperty(name);
        }
      }
      if (!active) {
        center.style.removeProperty('--inset-l');
        center.style.removeProperty('--inset-r');
        center.removeAttribute('data-nav-stacked');
        return;
      }
      const box = center.getBoundingClientRect();
      let left = 0;
      let right = 0;
      for (const el of ws.querySelectorAll<HTMLElement>('.tool-rail, .workspace > .panel')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        if (r.left + r.width / 2 < box.left + box.width / 2) left = Math.max(left, r.right - box.left);
        else right = Math.max(right, box.right - r.left);
      }
      center.style.setProperty('--inset-l', `${Math.round(left)}px`);
      center.style.setProperty('--inset-r', `${Math.round(right)}px`);
      // A 560px dock plus the zoom controls (about 274px) on each side of it needs this much room.
      center.toggleAttribute('data-nav-stacked', box.width - left - right < 560 + 2 * (274 + 28));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(ws);
    for (const el of ws.children) ro.observe(el);
    const mo = new MutationObserver(() => {
      for (const el of ws.children) ro.observe(el);
      update();
    });
    mo.observe(ws, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      shell?.style.removeProperty('--pill-l-max');
      shell?.style.removeProperty('--pill-r-max');
    };
  }, [active, mounted]);
  return ref;
}
