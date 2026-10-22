import { useEffect, useRef, useState } from 'react';
import {
  BUILD_STAGE_LABELS,
  BUILD_STAGES,
  IDLE_BUILD,
  advanceBuildStage,
  skipBuildToEnd,
  type BuildStage,
  type BuildState,
} from '../../shared/build-stages';
import { setState, useStore } from '../lib/store';

const STAGE_MS = 400;

export interface SubtreeBox {
  x: number;
  y: number;
  width: number;
  height: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  kind: 'container' | 'text' | 'image' | 'control';
  depth: number;
}

interface Props {
  /** World-space origin of the target frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  build: BuildState;
  /** Boxes from bridge measure-subtree, in frame-local coordinates. */
  boxes: SubtreeBox[];
  columns?: number;
}

export function BuildOverlay({ x, y, width, height, build, boxes, columns = 12 }: Props) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(build.phase);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPhase(build.phase);
  }, [build.phase, build.callId]);

  useEffect(() => {
    if (phase === 'idle' || phase === 'failed' || phase === 'stopped' || phase === 'grid') return;
    if (phase === 'finished') {
      const t = setTimeout(() => setState({ build: IDLE_BUILD }), reduced ? 0 : 500);
      return () => clearTimeout(t);
    }
    if (reduced) {
      const next = advanceBuildStage({ ...build, phase });
      const t = setTimeout(() => {
        setPhase(next.phase);
        setState({ build: next });
      }, 50);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const next = advanceBuildStage({ ...build, phase });
      setPhase(next.phase);
      setState({ build: next });
    }, STAGE_MS);
    return () => clearTimeout(t);
  }, [phase, build.callId, reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && getStateBuildActive()) {
        e.preventDefault();
        setState({ build: skipBuildToEnd(useStore.getState().build) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!liveRef.current || phase === 'idle') return;
    const label = phase in BUILD_STAGE_LABELS ? BUILD_STAGE_LABELS[phase as BuildStage] : phase;
    liveRef.current.textContent = `Building: ${label}`;
  }, [phase]);

  if (phase === 'idle') return null;

  const stageIndex = BUILD_STAGES.indexOf(phase as BuildStage);
  const colorVar = stageIndex >= 0 ? `var(--oc-stage-${phase})` : 'var(--fg-2)';

  return (
    <div
      className={`build-overlay${reduced ? ' is-reduced' : ''}`}
      data-stage={phase}
      style={{ left: x, top: y, width, height, ['--build-stage' as string]: colorVar }}
      onClick={() => setState({ build: skipBuildToEnd(useStore.getState().build) })}
      role="presentation"
    >
      <div className="build-overlay__live" ref={liveRef} aria-live="polite" aria-atomic="true" />
      <div className="build-overlay__legend" aria-hidden>
        {BUILD_STAGES.map((s) => (
          <span key={s} className={`build-overlay__pill${s === phase ? ' is-current' : ''}${stageIndex > BUILD_STAGES.indexOf(s) ? ' is-done' : ''}`} style={s === phase ? { background: `var(--oc-stage-${s})` } : undefined}>
            {BUILD_STAGE_LABELS[s]}
          </span>
        ))}
      </div>
      {build.explained && phase !== 'grid' && phase !== 'finished' && <div className="build-overlay__note">Explained from the result</div>}
      {phase === 'grid' && (
        <div className="build-overlay__grid" aria-hidden>
          {Array.from({ length: columns }, (_, i) => (
            <div key={i} className="build-overlay__col" />
          ))}
          <span className="build-overlay__building">Building…</span>
        </div>
      )}
      {(phase === 'padding' || phase === 'layout' || phase === 'skeleton') &&
        boxes.map((b, i) => (
          <div
            key={i}
            className={`build-overlay__box is-${phase} is-${b.kind}`}
            style={{
              left: b.x,
              top: b.y,
              width: Math.max(b.width, 1),
              height: Math.max(b.height, 1),
              paddingTop: phase === 'padding' ? b.padding?.top : undefined,
              paddingRight: phase === 'padding' ? b.padding?.right : undefined,
              paddingBottom: phase === 'padding' ? b.padding?.bottom : undefined,
              paddingLeft: phase === 'padding' ? b.padding?.left : undefined,
            }}
          />
        ))}
    </div>
  );
}

function getStateBuildActive() {
  const p = useStore.getState().build.phase;
  return p !== 'idle' && p !== 'failed' && p !== 'stopped';
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
