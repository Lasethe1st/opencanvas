/** The file OpenCanvas writes into a project the first time an element gets motion, and imports from the app entry. */
export const MOTION_RUNTIME_NAME = 'open-canvas-motion.js';
export const MOTION_DEPENDENCY = { name: 'motion', range: '^14.6.0' };

export const MOTION_RUNTIME_SOURCE = `/* Motion for elements that carry a data-motion attribute, powered by motion.dev.
   Written by OpenCanvas and safe to edit by hand: the visual editor only changes the data-motion* attributes. */
import { animate, hover, inView, press } from 'motion';

const EASE = { 'ease-out': [0.23, 1, 0.32, 1], 'ease-in-out': [0.77, 0, 0.175, 1], ease: [0.25, 0.1, 0.25, 1], linear: 'linear' };
const FROM = {
  fade: { opacity: 0 },
  rise: { opacity: 0, y: 16 },
  drop: { opacity: 0, y: -16 },
  'slide-left': { opacity: 0, x: -24 },
  'slide-right': { opacity: 0, x: 24 },
  scale: { opacity: 0, scale: 0.94 },
  blur: { opacity: 0, filter: 'blur(8px)' },
};
const REST = { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' };
const TO = { lift: { y: -4 }, grow: { scale: 1.04 }, dim: { opacity: 0.8 }, shrink: { scale: 0.97 }, sink: { y: 2 } };
const PROPS = ['opacity', 'transform', 'filter'];

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clear = (el) => PROPS.forEach((p) => el.style.removeProperty(p));
const back = (to) => Object.fromEntries(Object.keys(to).map((k) => [k, REST[k]]));

function timing(el) {
  const d = el.dataset;
  const seconds = Number(d.motionDuration) > 0 ? Number(d.motionDuration) : 0.4;
  const base = d.motionEase === 'spring' ? { type: 'spring', visualDuration: seconds, bounce: 0.2 } : { duration: seconds, ease: EASE[d.motionEase] || EASE['ease-out'] };
  return { ...base, delay: Number(d.motionDelay) > 0 ? Number(d.motionDelay) : 0 };
}

const live = new WeakMap();
const KEYS = ['motion', 'motionOn', 'motionDuration', 'motionDelay', 'motionEase'];

function setup(el) {
  const sig = KEYS.map((k) => el.dataset[k] || '').join('|');
  const prev = live.get(el);
  if (prev && prev.sig === sig) return;
  if (prev) prev.stop();
  live.delete(el);
  const preset = el.dataset.motion;
  if (!preset) {
    clear(el);
    el.removeAttribute('data-motion-ready');
    return;
  }
  const on = el.dataset.motionOn || 'load';
  const options = timing(el);
  const stops = [];
  let replay = () => {};

  if (on === 'hover' || on === 'press') {
    const to = TO[preset] || TO.lift;
    const react = (el) => {
      animate(el, to, options);
      return () => animate(el, back(to), options).finished.then(() => clear(el));
    };
    stops.push((on === 'hover' ? hover : press)(el, () => react(el)));
    replay = () => {
      animate(el, to, options).finished.then(() => animate(el, back(to), options).finished).then(() => clear(el));
    };
    el.setAttribute('data-motion-ready', '');
  } else {
    const from = FROM[preset] || FROM.fade;
    const enter = () => animate(el, REST, options).finished.then(() => clear(el));
    const hide = () => {
      el.style.opacity = '0';
      animate(el, from, { duration: 0 });
    };
    if (reduced()) {
      el.setAttribute('data-motion-ready', '');
    } else if (on === 'in-view') {
      hide();
      el.setAttribute('data-motion-ready', '');
      stops.push(inView(el, () => void enter(), { amount: 0.2 }));
    } else {
      hide();
      el.setAttribute('data-motion-ready', '');
      enter();
    }
    replay = () => {
      if (reduced()) return;
      hide();
      enter();
    };
  }
  live.set(el, { sig, replay, stop: () => stops.forEach((s) => typeof s === 'function' && s()) });
}

const scan = (root) => {
  if (root.matches && root.matches('[data-motion]')) setup(root);
  if (root.querySelectorAll) root.querySelectorAll('[data-motion]').forEach(setup);
};

function boot() {
  scan(document);
  document.addEventListener('oc-motion-replay', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target) live.get(target)?.replay();
  });
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') setup(r.target);
      else r.addedNodes.forEach((n) => n.nodeType === 1 && scan(n));
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-motion', 'data-motion-on', 'data-motion-duration', 'data-motion-delay', 'data-motion-ease'] });
}

if (typeof window !== 'undefined' && !window.__ocMotion) {
  window.__ocMotion = true;
  // Until the runtime has taken over an element, keep the ones that animate in hidden so they do not flash.
  const style = document.createElement('style');
  style.textContent = '[data-motion]:not([data-motion-on="hover"]):not([data-motion-on="press"]):not([data-motion-ready]){opacity:0}';
  document.head.appendChild(style);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
`;
