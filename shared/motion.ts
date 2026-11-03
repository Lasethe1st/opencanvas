/**
 * Motion for a project's elements, powered by motion.dev.
 *
 * The inspector writes a handful of `data-motion*` attributes onto the element in the source. A small
 * runtime in the project (`open-canvas-motion.js`, see motion-runtime.ts) reads them and animates with
 * Motion's `animate`, `inView`, `hover` and `press`. Elements stay plain host tags, so visual editing keeps working.
 */

export type MotionTrigger = 'load' | 'in-view' | 'hover' | 'press';
export type MotionEase = 'ease-out' | 'ease-in-out' | 'ease' | 'linear' | 'spring';

export interface MotionSpec {
  trigger: MotionTrigger;
  preset: string;
  /** Seconds. For a spring this is the visual duration. */
  duration: number;
  /** Seconds. */
  delay: number;
  ease: MotionEase;
}

export const TRIGGERS: { id: MotionTrigger; label: string; hint: string }[] = [
  { id: 'load', label: 'Load', hint: 'Plays when the page opens' },
  { id: 'in-view', label: 'Scroll', hint: 'Plays when it scrolls into view' },
  { id: 'hover', label: 'Hover', hint: 'Reacts while the pointer is over it' },
  { id: 'press', label: 'Press', hint: 'Reacts while it is pressed' },
];

export interface MotionPreset {
  id: string;
  label: string;
  hint: string;
}

const ENTER: MotionPreset[] = [
  { id: 'fade', label: 'Fade', hint: 'Opacity eases in' },
  { id: 'rise', label: 'Rise', hint: 'Fades in while lifting up' },
  { id: 'drop', label: 'Drop', hint: 'Fades in while settling down' },
  { id: 'slide-left', label: 'Slide in', hint: 'Slides in from the left' },
  { id: 'slide-right', label: 'Slide back', hint: 'Slides in from the right' },
  { id: 'scale', label: 'Scale', hint: 'Grows in from slightly smaller' },
  { id: 'blur', label: 'Focus', hint: 'Fades in from a blur' },
];

const HOVER: MotionPreset[] = [
  { id: 'lift', label: 'Lift', hint: 'Rises a few pixels' },
  { id: 'grow', label: 'Grow', hint: 'Scales up slightly' },
  { id: 'dim', label: 'Dim', hint: 'Fades a little' },
];

const PRESS: MotionPreset[] = [
  { id: 'shrink', label: 'Shrink', hint: 'Scales down a touch' },
  { id: 'sink', label: 'Sink', hint: 'Moves down 2px' },
  { id: 'dim', label: 'Dim', hint: 'Fades a little' },
];

export function presetsFor(trigger: MotionTrigger): MotionPreset[] {
  return trigger === 'hover' ? HOVER : trigger === 'press' ? PRESS : ENTER;
}

export const EASES: { id: MotionEase; label: string }[] = [
  { id: 'ease-out', label: 'Ease out' },
  { id: 'ease-in-out', label: 'Ease in-out' },
  { id: 'ease', label: 'Ease' },
  { id: 'linear', label: 'Linear' },
  { id: 'spring', label: 'Spring' },
];

const DEFAULTS: Record<MotionTrigger, { preset: string; duration: number }> = {
  load: { preset: 'rise', duration: 0.5 },
  'in-view': { preset: 'rise', duration: 0.5 },
  hover: { preset: 'lift', duration: 0.2 },
  press: { preset: 'shrink', duration: 0.15 },
};

/** A fresh spec for a trigger, optionally keeping the duration/delay/ease already chosen. */
export function defaultSpec(trigger: MotionTrigger, keep?: Partial<MotionSpec>): MotionSpec {
  const d = DEFAULTS[trigger];
  return { trigger, preset: d.preset, duration: keep?.duration ?? d.duration, delay: keep?.delay ?? 0, ease: keep?.ease ?? 'ease-out' };
}

export const MOTION_ATTRS = ['data-motion', 'data-motion-on', 'data-motion-duration', 'data-motion-delay', 'data-motion-ease'] as const;

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** The attributes to write (a null value removes the attribute). */
export function motionToAttributes(spec: MotionSpec | null): Record<(typeof MOTION_ATTRS)[number], string | null> {
  if (!spec) return { 'data-motion': null, 'data-motion-on': null, 'data-motion-duration': null, 'data-motion-delay': null, 'data-motion-ease': null };
  return {
    'data-motion': spec.preset,
    'data-motion-on': spec.trigger,
    'data-motion-duration': num(spec.duration),
    'data-motion-delay': spec.delay ? num(spec.delay) : null,
    'data-motion-ease': spec.ease === 'ease-out' ? null : spec.ease,
  };
}

const TRIGGER_IDS = new Set<string>(TRIGGERS.map((t) => t.id));
const EASE_IDS = new Set<string>(EASES.map((e) => e.id));

/** Reads a spec back from an element's attributes; null when it has no motion. */
export function motionFromAttributes(attrs: Record<string, string>): MotionSpec | null {
  const preset = attrs['data-motion'];
  if (!preset) return null;
  const on = attrs['data-motion-on'];
  const trigger: MotionTrigger = on && TRIGGER_IDS.has(on) ? (on as MotionTrigger) : 'load';
  const duration = Number(attrs['data-motion-duration']);
  const delay = Number(attrs['data-motion-delay']);
  const ease = attrs['data-motion-ease'];
  return {
    trigger,
    preset,
    duration: Number.isFinite(duration) && duration > 0 ? duration : DEFAULTS[trigger].duration,
    delay: Number.isFinite(delay) && delay > 0 ? delay : 0,
    ease: ease && EASE_IDS.has(ease) ? (ease as MotionEase) : 'ease-out',
  };
}

/** Rejects specs that could not have come from the panel (the edit writes them straight into source). */
export function isValidMotion(spec: MotionSpec): boolean {
  return (
    TRIGGER_IDS.has(spec.trigger) &&
    presetsFor(spec.trigger).some((p) => p.id === spec.preset) &&
    EASE_IDS.has(spec.ease) &&
    Number.isFinite(spec.duration) && spec.duration > 0 && spec.duration <= 10 &&
    Number.isFinite(spec.delay) && spec.delay >= 0 && spec.delay <= 10
  );
}
