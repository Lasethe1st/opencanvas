import type { AiEvent } from './ai';

export const BUILD_STAGES = ['grid', 'padding', 'layout', 'skeleton', 'finished'] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];

export const BUILD_STAGE_LABELS: Record<BuildStage, string> = {
  grid: 'Grid',
  padding: 'Padding',
  layout: 'Layout',
  skeleton: 'Skeleton',
  finished: 'Finished Design',
};

/** Tools that rewrite structure and should play the build overlay. */
export const STRUCTURAL_TOOLS = new Set(['insert_jsx', 'insert_element', 'write_file', 'propose_variant']);

export type BuildPhase = BuildStage | 'failed' | 'stopped' | 'idle';

export interface BuildState {
  phase: BuildPhase;
  turnId: string | null;
  callId: string | null;
  tool: string | null;
  elementId: string | null;
  /** True while Padding→Skeleton are labelled as explained from the finished result. */
  explained: boolean;
  frameId: string | null;
}

export const IDLE_BUILD: BuildState = {
  phase: 'idle',
  turnId: null,
  callId: null,
  tool: null,
  elementId: null,
  explained: false,
  frameId: null,
};

const AFTER_SUCCESS: BuildStage[] = ['padding', 'layout', 'skeleton', 'finished'];

export function isStructuralTool(tool: string): boolean {
  return STRUCTURAL_TOOLS.has(tool);
}

/**
 * Pure reducer: structural tool-start → Grid; successful tool-end walks Padding→Finished;
 * failure / stop / error never reach Finished. Non-structural tools are ignored.
 */
export function reduceBuild(state: BuildState, event: AiEvent, opts?: { frameId?: string | null }): BuildState {
  switch (event.type) {
    case 'start':
      return { ...IDLE_BUILD, turnId: event.turnId, frameId: opts?.frameId ?? state.frameId };
    case 'tool-start': {
      if (state.turnId && event.turnId !== state.turnId) return state;
      if (!isStructuralTool(event.tool)) return state;
      return {
        phase: 'grid',
        turnId: event.turnId,
        callId: event.callId,
        tool: event.tool,
        elementId: null,
        explained: false,
        frameId: opts?.frameId ?? state.frameId,
      };
    }
    case 'tool-end': {
      if (state.turnId && event.turnId !== state.turnId) return state;
      if (state.callId && event.callId !== state.callId && state.phase !== 'idle') {
        // A different structural tool can start a new overlay.
        if (!event.ok) return { ...state, phase: 'failed', explained: false };
        return state;
      }
      if (state.phase !== 'grid' && state.phase !== 'idle') {
        if (!event.ok) return { ...state, phase: 'failed', explained: false, elementId: event.elementId ?? state.elementId };
        return state;
      }
      if (state.phase === 'idle') return state;
      if (!event.ok) {
        return { ...state, phase: 'failed', explained: false, elementId: event.elementId ?? state.elementId };
      }
      return {
        ...state,
        phase: 'padding',
        explained: true,
        elementId: event.elementId ?? state.elementId,
      };
    }
    case 'done':
      if (state.turnId && event.turnId !== state.turnId) return state;
      if (state.phase === 'idle' || state.phase === 'finished') return IDLE_BUILD;
      if (event.stopped) return { ...state, phase: 'stopped', explained: false };
      if (state.phase === 'failed' || state.phase === 'stopped') return state;
      // Turn ended while still on Grid (tool never finished) → stop; otherwise leave derived stages to the overlay timer.
      if (state.phase === 'grid') return { ...state, phase: 'stopped', explained: false };
      return state;
    case 'error':
      if (state.turnId && event.turnId !== state.turnId) return state;
      if (state.phase === 'idle') return state;
      return { ...state, phase: 'failed', explained: false };
    default:
      return state;
  }
}

/** Advance one derived stage after success (padding → … → finished), or clear when done. */
export function advanceBuildStage(state: BuildState): BuildState {
  if (state.phase === 'finished') return IDLE_BUILD;
  const i = AFTER_SUCCESS.indexOf(state.phase as BuildStage);
  if (i === -1) return state;
  const next = AFTER_SUCCESS[i + 1];
  if (!next) return IDLE_BUILD;
  return { ...state, phase: next, explained: next !== 'finished' };
}

export function skipBuildToEnd(state: BuildState): BuildState {
  if (state.phase === 'idle' || state.phase === 'failed' || state.phase === 'stopped') return IDLE_BUILD;
  if (state.phase === 'grid') return { ...state, phase: 'stopped', explained: false };
  return IDLE_BUILD;
}
