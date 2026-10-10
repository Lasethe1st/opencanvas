import { AlertTriangle, Box, CirclePause, Heading, LayoutTemplate, PackageOpen, RefreshCw } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { handleShortcut } from '../lib/shortcuts';
import { cancelInstall, insertElement, installDependencies, refreshSourceInfo, restartPreview } from '../lib/actions';
import { sendToPreview, setPreviewFrame } from '../lib/bridge';
import { getState, setState, useStore, type Selection, type TreeNode } from '../lib/store';
import { viewportSize, VIEWPORT_LABEL } from '../lib/viewport';
import { Canvas as CanvasShell, CanvasBar, CanvasFrame, StateCard } from '../ui/Canvas.jsx';
import { Button, Notice } from '../ui/primitives.jsx';
import { Dock } from './Dock';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2];

function useBridgeMessages(frameRef: React.RefObject<HTMLIFrameElement | null>) {
  useEffect(() => {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.pendingSelectId && state.pendingSelectId !== prev.pendingSelectId) {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => setState({ pendingSelectId: null }), 4000);
      }
    });

    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.source !== 'oc-bridge') return;
      const state = getState();
      switch (msg.type) {
        case 'ready':
          sendToPreview('mode', { mode: state.interact ? 'interact' : 'select' });
          if (state.pendingSelectId || state.selection) sendToPreview('select', { id: state.pendingSelectId ?? state.selection!.id, scroll: false });
          break;
        case 'tree':
          setState({ domTree: msg.payload as TreeNode[] });
          if (state.pendingSelectId) sendToPreview('select', { id: state.pendingSelectId, scroll: true });
          break;
        case 'select': {
          const payload = msg.payload as Selection | null;
          if (!payload) {
            if (state.pendingSelectId) return;
            setState({ selection: null, sourceInfo: null, sourceError: null });
            return;
          }
          const changed = state.selection?.id !== payload.id;
          setState({ selection: payload, pendingSelectId: state.pendingSelectId === payload.id ? null : state.pendingSelectId });
          if (changed) {
            setState({ sourceInfo: null, sourceError: null });
            void refreshSourceInfo();
          }
          break;
        }
        case 'hover':
          setState({ hoverUid: msg.payload?.uid ?? null });
          break;
        case 'key':
          handleShortcut(msg.payload.key, msg.payload.meta, msg.payload.shift);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      unsubscribe();
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [frameRef]);
}

function StatusCard() {
  const status = useStore((s) => s.previewStatus);
  const project = useStore((s) => s.project)!;
  const installing = useStore((s) => s.installing);
  const installLog = useStore((s) => s.installLog);
  const vite = project.framework === 'vite-react';

  if (installing) {
    return (
      <StateCard busy title="Installing dependencies…" log={installLog ? installLog.slice(-1500) : undefined} actions={<Button onClick={() => void cancelInstall()}>Cancel</Button>}>
        Running {project.packageManager} install in the project folder.
      </StateCard>
    );
  }
  if (status.state === 'starting') {
    return (
      <StateCard busy title="Starting preview…">
        Launching a local development server for this project.
      </StateCard>
    );
  }
  if (status.state === 'error') {
    const needsInstall = !project.hasNodeModules && !project.managedPreview && vite;
    return (
      <StateCard
        icon={<AlertTriangle size={18} />}
        title="Preview unavailable"
        log={status.log ? status.log.slice(-2000) : undefined}
        actions={
          <>
            {needsInstall && (
              <Button variant="primary" onClick={() => void installDependencies()}>
                Install dependencies
              </Button>
            )}
            {vite && (
              <Button icon={<RefreshCw size={13} />} onClick={() => void restartPreview()}>
                Retry
              </Button>
            )}
            <Button onClick={() => setState({ mode: 'code' })}>Open code view</Button>
          </>
        }
      >
        {status.error}
      </StateCard>
    );
  }
  return (
    <StateCard
      icon={<CirclePause size={18} />}
      title="Preview stopped"
      actions={
        vite && (
          <Button variant="primary" onClick={() => void restartPreview()}>
            Start preview
          </Button>
        )
      }
    >
      {vite ? 'Start the development server to see this project.' : (project.warnings[0] ?? 'This project type cannot be previewed yet.')}
    </StateCard>
  );
}

function EmptyPageCard() {
  return (
    <StateCard
      icon={<LayoutTemplate size={18} />}
      title="This page is empty"
      actions={
        <>
          <Button variant="primary" icon={<LayoutTemplate size={13} />} onClick={() => void insertElement('section')}>
            Add section
          </Button>
          <Button icon={<Heading size={13} />} onClick={() => void insertElement('heading')}>
            Heading
          </Button>
          <Button icon={<Box size={13} />} onClick={() => void insertElement('div')}>
            Container
          </Button>
        </>
      }
    >
      Add your first element, or use the dock below to insert text, images, buttons and layouts.
    </StateCard>
  );
}

export function Canvas({ hidden }: { hidden: boolean }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const status = useStore((s) => s.previewStatus);
  const project = useStore((s) => s.project)!;
  const viewport = useStore((s) => s.viewport);
  const zoom = useStore((s) => s.zoom);
  const interact = useStore((s) => s.interact);
  const domTree = useStore((s) => s.domTree);
  const [stage, setStage] = useState({ width: 1000, height: 700 });

  useBridgeMessages(frameRef);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setStage({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status.state !== 'running') setState({ domTree: [], selection: null, sourceInfo: null });
  }, [status.state]);

  const size = viewportSize(viewport, project.breakpoints);
  const availableWidth = Math.max(stage.width - 64, 200);
  const fitScale = Math.min(1, availableWidth / size.width);
  const scale = zoom === 'fit' ? fitScale : zoom;
  const frameHeight = size.height ?? Math.max(560, (stage.height - 120) / scale);

  const stepZoom = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > scale + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < scale - 0.001);
    if (next) setState({ zoom: next });
  };

  const running = status.state === 'running';
  const isEmpty = running && domTree.length === 1 && domTree[0].children.length === 0;
  const label = `${VIEWPORT_LABEL[viewport]} · ${size.width}px${viewport !== 'desktop' ? ` · ≤ ${viewport === 'tablet' ? project.breakpoints.tablet : project.breakpoints.mobile}px overrides` : ''}${project.breakpoints.detected ? ' · breakpoints from project CSS' : ''}`;

  return (
    <CanvasShell
      style={hidden ? { display: 'none' } : undefined}
      stageRef={stageRef}
      bar={
        <CanvasBar
          label={label}
          zoom={`${Math.round(scale * 100)}%`}
          onZoomOut={() => stepZoom(-1)}
          onZoomIn={() => stepZoom(1)}
          onFit={() => setState({ zoom: 'fit' })}
          onActual={() => setState({ zoom: 1 })}
          fitActive={zoom === 'fit'}
          onReload={running ? () => frameRef.current?.contentWindow?.location.reload() : undefined}
        />
      }
      notice={
        running &&
        project.missingDependencies.length > 0 && (
          <Notice
            icon={<PackageOpen size={15} />}
            action={
              <Button variant="primary" size="sm" onClick={() => void installDependencies()}>
                Install dependencies
              </Button>
            }
          >
            Not installed: <strong>{project.missingDependencies.join(', ')}</strong>. Imports of these packages will fail in the preview.
          </Notice>
        )
      }
      overlay={(!running || isEmpty) && !interact ? running ? <EmptyPageCard /> : <StatusCard /> : undefined}
      dock={running && <Dock />}
    >
      {running && (
        <CanvasFrame width={size.width} height={frameHeight} scale={scale}>
          <iframe
            ref={(el) => {
              frameRef.current = el;
              setPreviewFrame(el);
            }}
            key={status.url}
            src={status.url}
            title="Project preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
          />
        </CanvasFrame>
      )}
    </CanvasShell>
  );
}
