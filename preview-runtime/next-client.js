// Added to the Next.js client entry by the OpenCanvas preview only: catches early errors, then loads the bridge.
import './early-errors.js';

if (typeof window !== 'undefined' && window.parent !== window && !window.__ocBridgeRequested) {
  window.__ocBridgeRequested = true;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = '/@open-canvas/bridge.js';
  const add = () => document.body.appendChild(script);
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add, { once: true });
}
