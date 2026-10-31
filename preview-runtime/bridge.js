// Injected into each preview iframe by the OpenCanvas preview server only.
// Communicates with the editor exclusively through postMessage; the editor tells frames apart by event.source.
(() => {
  if (window.__openCanvasBridge || window.parent === window) return;
  window.__openCanvasBridge = true;

  const SOURCE = 'oc-bridge';
  const ATTR = 'data-oc-id';
  const STYLE_PROPS = [
    'display', 'position', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'overflow',
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-decoration-line',
    'text-transform', 'color', 'background-color', 'background-image', 'opacity',
    'border-top-color', 'border-top-width', 'border-top-style', 'border-radius', 'box-shadow', 'visibility', 'object-fit',
    'top', 'right', 'bottom', 'left', 'z-index',
  ];
  const FRIENDLY = {
    h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading',
    p: 'Paragraph', a: 'Link', button: 'Button', img: 'Image', section: 'Section', header: 'Header',
    footer: 'Footer', nav: 'Navigation', main: 'Main', article: 'Article', aside: 'Aside', ul: 'List',
    ol: 'List', li: 'List item', form: 'Form', input: 'Input', span: 'Text', label: 'Label', table: 'Table',
  };
  const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'label', 'li']);

  let mode = 'select';
  let selected = null;
  let selectedId = null;
  // Selection mirrored from another frame: drawn subtly and never reported back.
  let linked = null;
  let linkedId = null;
  let hovered = null;
  let measureOn = false;
  let uidCounter = 0;
  const uids = new WeakMap();
  const byUid = new Map();
  // Inline text editing: `editing` while the caret is in the element, `pending` while the editor writes the source.
  let editing = null;
  let pending = null;

  const post = (type, payload, meta) => window.parent.postMessage({ source: SOURCE, type, payload, ...meta }, '*');

  const host = document.createElement('div');
  host.setAttribute('data-oc-overlay', '');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .box { position: fixed; box-sizing: border-box; pointer-events: none; display: none; border-radius: 1px; }
      .hover { border: 1px solid rgba(59,130,246,.7); }
      :host { --k: 1; }
      .select { border: calc(1.5px * var(--k)) solid #3b82f6; }
      .handle { position: absolute; width: calc(7px * var(--k)); height: calc(7px * var(--k)); box-sizing: border-box; background: #fff; border: calc(1.5px * var(--k)) solid #3b82f6; border-radius: calc(1.5px * var(--k)); }
      .handle { --o: calc(-4.25px * var(--k)); }
      .handle.tl { left: var(--o); top: var(--o); } .handle.tr { right: var(--o); top: var(--o); }
      .handle.bl { left: var(--o); bottom: var(--o); } .handle.br { right: var(--o); bottom: var(--o); }
      .editing .handle { display: none; }
      .linked { border: 1px dashed rgba(59,130,246,.55); }
      .editing { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.18); }
      .label { position: absolute; left: -2px; top: -21px; font: 500 11px/1 Inter, system-ui, sans-serif; color: #fff;
        background: #3b82f6; padding: 4px 6px; border-radius: 4px; white-space: nowrap; }
      .hover .label { background: rgba(59,130,246,.85); }
      .label.below { top: auto; bottom: -21px; }
      .label { transform: scale(var(--k)); transform-origin: left bottom; }
      .label.below { transform-origin: left top; }
      .linked .label, .editing .label { display: none; }
      .multi { border: 1.5px solid #3b82f6; }
      .multi.is-linked { border: 1px dashed rgba(59,130,246,.55); }
      .measure { position: fixed; inset: 0; pointer-events: none; }
      .m-line { position: absolute; background: #f43f5e; }
      .m-label { position: absolute; transform: translate(-50%, -50%) scale(var(--k)); font: 600 10px/1 Inter, system-ui, sans-serif; color: #fff; background: #f43f5e; padding: 3px 5px; border-radius: 999px; white-space: nowrap; }
      .m-box { position: absolute; box-sizing: border-box; border: 1px solid #f43f5e; }
      .token-hit { border: 1.5px dashed #d97706; box-shadow: 0 0 0 1px rgba(217,119,6,.25); }
      .token-hit .label { background: #d97706; }
    </style>
    <div class="box hover"><span class="label"></span></div>
    <div class="box linked"></div>
    <div class="box select"><span class="label"></span><i class="handle tl"></i><i class="handle tr"></i><i class="handle bl"></i><i class="handle br"></i></div>`;
  const measureLayer = document.createElement('div');
  measureLayer.className = 'measure';
  shadow.appendChild(measureLayer);
  const hoverBox = shadow.querySelector('.hover');
  const linkedBox = shadow.querySelector('.linked');
  const selectBox = shadow.querySelector('.select');
  // Other elements in a multi-selection (the primary one uses selectBox / linkedBox).
  let multiIds = [];
  let multiLinked = false;
  const multiBoxes = [];
  /** Design-system impact: highlight elements that use a token (`data-oc` keys or source ids). */
  let tokenHighlightKeys = [];
  let tokenHighlightIds = [];
  let tokenHighlightLabel = '';
  const tokenHighlightBoxes = [];

  function attachOverlay() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function uidOf(el) {
    let uid = uids.get(el);
    if (!uid) {
      uid = `u${++uidCounter}`;
      uids.set(el, uid);
    }
    byUid.set(uid, el);
    return uid;
  }

  const byId = (id) => (id ? document.querySelector(`[${ATTR}="${CSS.escape(id)}"]`) : null);

  function nameOf(el) {
    const explicit = el.getAttribute('data-oc-name');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const base = FRIENDLY[tag] || tag;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    return cls ? `${base} .${cls}` : base;
  }

  function sourceParent(el) {
    let node = el.parentElement;
    while (node && !node.hasAttribute(ATTR)) node = node.parentElement;
    return node;
  }

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };

  function describe(el) {
    const cs = getComputedStyle(el);
    const computed = {};
    for (const prop of STYLE_PROPS) computed[prop] = cs.getPropertyValue(prop);
    const parent = sourceParent(el);
    return {
      id: el.getAttribute(ATTR),
      uid: uidOf(el),
      tag: el.tagName.toLowerCase(),
      name: nameOf(el),
      parentId: parent ? parent.getAttribute(ATTR) : null,
      computed,
      rect: rectOf(el),
    };
  }

  function buildTree(root) {
    const out = [];
    for (const child of root.children) {
      if (child === host) continue;
      if (child.hasAttribute(ATTR)) {
        out.push({ id: child.getAttribute(ATTR), uid: uidOf(child), tag: child.tagName.toLowerCase(), name: nameOf(child), children: buildTree(child) });
      } else {
        out.push(...buildTree(child));
      }
    }
    return out;
  }

  function place(box, el, text) {
    if (!el || !el.isConnected) {
      box.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${Math.max(r.width, 1)}px`;
    box.style.height = `${Math.max(r.height, 1)}px`;
    const label = box.querySelector('.label');
    if (label) {
      label.textContent = text;
      label.classList.toggle('below', r.top < 24);
    }
  }

  // Measure mode: distances (px) from the selection to what is hovered, or to its parent's edges.
  function drawMeasure() {
    measureLayer.textContent = '';
    if (!measureOn || mode !== 'select' || editing) return;
    const a = selected && selected.isConnected ? selected : null;
    const b = hovered && hovered.isConnected && hovered !== a ? hovered : null;
    const from = a || b;
    if (!from) return;
    const fr = from.getBoundingClientRect();
    const k = parseFloat(host.style.getPropertyValue('--k')) || 1;
    const add = (cls, css, text) => {
      const n = document.createElement('div');
      n.className = cls;
      n.style.cssText = css;
      if (text) n.textContent = text;
      measureLayer.appendChild(n);
    };
    const hline = (x1, x2, y) => {
      const w = Math.abs(x2 - x1);
      if (w < 0.5) return;
      add('m-line', `left:${Math.min(x1, x2)}px;top:${y}px;width:${w}px;height:${k}px`);
      add('m-label', `left:${(x1 + x2) / 2}px;top:${y}px`, String(Math.round(w)));
    };
    const vline = (y1, y2, x) => {
      const h = Math.abs(y2 - y1);
      if (h < 0.5) return;
      add('m-line', `left:${x}px;top:${Math.min(y1, y2)}px;width:${k}px;height:${h}px`);
      add('m-label', `left:${x}px;top:${(y1 + y2) / 2}px`, String(Math.round(h)));
    };
    const insets = (inner, outer) => {
      const cx = inner.left + inner.width / 2;
      const cy = inner.top + inner.height / 2;
      hline(outer.left, inner.left, cy);
      hline(inner.right, outer.right, cy);
      vline(outer.top, inner.top, cx);
      vline(inner.bottom, outer.bottom, cx);
    };
    const has = (o, i) => o.left <= i.left + 0.5 && o.top <= i.top + 0.5 && o.right >= i.right - 0.5 && o.bottom >= i.bottom - 0.5;
    const outline = (r) => add('m-box', `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`);
    if (a && b) {
      const br = b.getBoundingClientRect();
      outline(br);
      if (has(br, fr)) insets(fr, br);
      else if (has(fr, br)) insets(br, fr);
      else {
        const oy1 = Math.max(fr.top, br.top);
        const oy2 = Math.min(fr.bottom, br.bottom);
        const ox1 = Math.max(fr.left, br.left);
        const ox2 = Math.min(fr.right, br.right);
        const y = oy2 > oy1 ? (oy1 + oy2) / 2 : fr.top + fr.height / 2;
        const x = ox2 > ox1 ? (ox1 + ox2) / 2 : fr.left + fr.width / 2;
        if (fr.right <= br.left) hline(fr.right, br.left, y);
        else if (br.right <= fr.left) hline(br.right, fr.left, y);
        if (fr.bottom <= br.top) vline(fr.bottom, br.top, x);
        else if (br.bottom <= fr.top) vline(br.bottom, fr.top, x);
      }
    } else {
      const parent = from.parentElement && from.parentElement !== document.documentElement ? from.parentElement : null;
      const pr = parent ? parent.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
      if (parent) outline(pr);
      insets(fr, pr);
    }
  }

  function render() {
    attachOverlay();
    drawMeasure();
    const active = mode === 'select';
    const showHover = active && !editing && hovered && hovered !== selected;
    place(hoverBox, showHover ? hovered : null, hovered ? `${nameOf(hovered)} · ${hovered.tagName.toLowerCase()}` : '');
    place(linkedBox, active && !selected ? linked : null, '');
    const size = selected && selected.isConnected ? selected.getBoundingClientRect() : null;
    place(selectBox, active ? selected : null, selected && size ? `${nameOf(selected)} · ${Math.round(size.width)}×${Math.round(size.height)}` : '');
    selectBox.classList.toggle('editing', !!editing);
    const els = active ? multiIds.flatMap((id) => [...document.querySelectorAll(`[${ATTR}="${CSS.escape(id)}"]`)]) : [];
    while (multiBoxes.length < els.length) {
      const box = document.createElement('div');
      box.className = 'box multi';
      shadow.appendChild(box);
      multiBoxes.push(box);
    }
    multiBoxes.forEach((box, i) => {
      box.classList.toggle('is-linked', multiLinked);
      place(box, els[i] ?? null, '');
    });
    const tokenEls = [];
    const seen = new Set();
    for (const key of tokenHighlightKeys) {
      for (const el of document.querySelectorAll(`[data-oc="${CSS.escape(key)}"]`)) {
        if (seen.has(el)) continue;
        seen.add(el);
        tokenEls.push(el);
      }
    }
    for (const id of tokenHighlightIds) {
      for (const el of document.querySelectorAll(`[${ATTR}="${CSS.escape(id)}"]`)) {
        if (seen.has(el)) continue;
        seen.add(el);
        tokenEls.push(el);
      }
    }
    while (tokenHighlightBoxes.length < tokenEls.length) {
      const box = document.createElement('div');
      box.className = 'box token-hit';
      box.innerHTML = '<span class="label"></span>';
      shadow.appendChild(box);
      tokenHighlightBoxes.push(box);
    }
    tokenHighlightBoxes.forEach((box, i) => {
      const el = tokenEls[i];
      place(box, el ?? null, el ? tokenHighlightLabel || nameOf(el) : '');
    });
  }

  function target(event) {
    return event.target instanceof Element ? event.target.closest(`[${ATTR}]`) : null;
  }

  // scrollIntoView would also scroll the editor's own document, so scroll only containers inside the preview.
  function scrollWithinPreview(el) {
    for (let box = el.parentElement; box && box !== document.body && box !== document.documentElement; box = box.parentElement) {
      const style = getComputedStyle(box);
      if (!/(auto|scroll|overlay)/.test(style.overflowY) || box.scrollHeight <= box.clientHeight) continue;
      const outer = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.top < outer.top || r.top > outer.bottom - 40) box.scrollTop += r.top - outer.top - Math.min(60, box.clientHeight / 4);
    }
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.top <= window.innerHeight - 40) return;
    window.scrollBy({ top: r.top - window.innerHeight / 3, behavior: 'smooth' });
  }

  // `user` marks selections made by pointer or keyboard in this frame; only those may make it the active frame.
  // `additive` is 'toggle' for Shift/Ctrl/Cmd+click, or 'keep' when the editor manages the rest of the group.
  function select(el, notify = true, user = false, additive) {
    if (editing && editing.el !== el) finishEditing(true);
    selected = el;
    selectedId = el ? el.getAttribute(ATTR) : null;
    linked = null;
    linkedId = null;
    render();
    if (notify) post('select', el ? describe(el) : null, { user, additive });
  }

  function setLinked(el) {
    if (editing) finishEditing(true);
    selected = null;
    selectedId = null;
    linked = el;
    linkedId = el ? el.getAttribute(ATTR) : null;
    render();
  }

  /* ---------- Inline text editing ---------- */

  function requestInlineEdit(el) {
    if (!el || mode !== 'select' || editing || pending) return;
    // A render is still settling (e.g. a hot reload): wait so the draft starts from React's current DOM.
    if (syncTimer) {
      setTimeout(() => requestInlineEdit(el), 120);
      return;
    }
    const tag = el.tagName.toLowerCase();
    if (selected !== el) select(el, true, true);
    post('inlineEditRequest', { id: el.getAttribute(ATTR), uid: uidOf(el), tag, eligible: TEXT_TAGS.has(tag) });
  }

  function startEditing(el) {
    if (!el || !el.isConnected || editing || pending) return;
    // Remember React's own nodes so they can be put back untouched; React keeps references to them.
    const nodes = Array.from(el.childNodes).map((node) => ({ node, value: node.nodeType === Node.TEXT_NODE ? node.nodeValue : null }));
    editing = { el, id: el.getAttribute(ATTR), nodes, before: el.innerText };
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'false');
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    hovered = null;
    render();
    post('inlineEditing', { active: true, id: editing.id });
  }

  function cleanText(raw) {
    return raw
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
  }

  function restore(session, text) {
    const { el, nodes } = session;
    el.replaceChildren(...nodes.map((n) => n.node));
    nodes.forEach((n) => {
      if (n.value !== null) n.node.nodeValue = n.value;
    });
    // A single text node can show the new text right away; React writes the same value on reload.
    if (typeof text === 'string' && nodes.length === 1 && nodes[0].value !== null && !text.includes('\n')) nodes[0].node.nodeValue = text;
  }

  function finishEditing(commit) {
    if (!editing) return;
    const session = editing;
    editing = null;
    const { el, id, before } = session;
    const text = cleanText(el.innerText);
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    window.getSelection()?.removeAllRanges();
    if (el === document.activeElement) el.blur();
    if (session.stale) {
      // The page re-rendered underneath the draft; our saved nodes may no longer be React's.
      post('inlineEditCancel', { id, stale: true });
      location.reload();
      return;
    }
    if (commit && text !== cleanText(before)) {
      pending = { ...session, text };
      post('inlineEditCommit', { id, text });
    } else {
      restore(session);
      post('inlineEditCancel', { id });
      scheduleSync();
    }
    render();
  }

  function settlePending(ok) {
    if (!pending) return;
    const session = pending;
    pending = null;
    restore(session, ok ? session.text : undefined);
    scheduleSync();
  }

  /* ---------- Pointer & keyboard ---------- */

  const insideEditing = (event) => editing && event.target instanceof Node && editing.el.contains(event.target);

  document.addEventListener('mousemove', (event) => {
    if (mode !== 'select' || editing) return;
    const el = target(event);
    if (el !== hovered) {
      hovered = el;
      render();
      post('hover', el ? { id: el.getAttribute(ATTR), uid: uidOf(el) } : null);
    }
  }, true);

  document.addEventListener('mouseleave', () => {
    hovered = null;
    render();
    post('hover', null);
  });

  for (const type of ['click', 'mousedown', 'mouseup', 'dblclick', 'submit']) {
    document.addEventListener(type, (event) => {
      if (mode !== 'select') return;
      if (insideEditing(event)) {
        // Let the caret move inside the text, but never follow links or press buttons.
        if (type === 'click' || type === 'submit') event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (type === 'mousedown' && editing) finishEditing(true);
      if (type === 'click') {
        const el = target(event);
        const additive = el && (event.shiftKey || event.ctrlKey || event.metaKey) ? 'toggle' : undefined;
        select(el, true, true, additive);
      }
      else if (type === 'dblclick') requestInlineEdit(target(event));
    }, true);
  }

  let lastTap = { time: 0, x: 0, y: 0, el: null };
  document.addEventListener('pointerup', (event) => {
    if (mode !== 'select' || event.pointerType !== 'touch' || editing) return;
    const el = target(event);
    const now = performance.now();
    const near = Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24;
    if (el && el === lastTap.el && now - lastTap.time < 350 && near) {
      lastTap = { time: 0, x: 0, y: 0, el: null };
      requestInlineEdit(el);
    } else {
      lastTap = { time: now, x: event.clientX, y: event.clientY, el };
    }
  }, true);

  document.addEventListener('focusout', (event) => {
    if (editing && event.target === editing.el) finishEditing(true);
  }, true);

  document.addEventListener('paste', (event) => {
    if (!insideEditing(event)) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    document.execCommand('insertText', false, text);
  }, true);

  const draggingFiles = (event) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');
  for (const type of ['drop', 'dragover', 'dragenter']) {
    document.addEventListener(type, (event) => {
      if (editing) event.preventDefault();
      else if (mode === 'select' && draggingFiles(event)) {
        // The editor shows a drop target over the frames; never let the page navigate to the file.
        event.preventDefault();
        if (type === 'dragenter') post('filedrag', {});
      }
    }, true);
  }

  const typingTarget = (event) => event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]');

  window.addEventListener('keydown', (event) => {
    if (editing) {
      event.stopPropagation();
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        finishEditing(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finishEditing(false);
      }
      return;
    }
    if (mode !== 'select') return;
    const meta = event.metaKey || event.ctrlKey;
    if (event.key === ' ' && !typingTarget(event)) {
      event.preventDefault();
      if (!event.repeat) post('space', { down: true });
      return;
    }
    if (event.key === 'Escape') select(null, true, true);
    else if (typingTarget(event)) return;
    else if (
      (meta && /^[zydgae/[\]]$/i.test(event.key)) ||
      (meta && ['=', '+', '-', '0'].includes(event.key)) ||
      (event.shiftKey && ['!', '@', '1', '2'].includes(event.key)) ||
      (!meta && !event.altKey && /^[vhpfrtibl/?]$/i.test(event.key)) ||
      (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) ||
      ['Delete', 'Backspace', 'Tab', 'Enter', 'F2'].includes(event.key)
    ) {
      post('key', { key: event.key, code: event.code, meta, shift: event.shiftKey, alt: event.altKey });
      event.preventDefault();
    }
  }, true);

  window.addEventListener('keyup', (event) => {
    if (event.key === ' ' && !editing) post('space', { down: false });
  }, true);

  // Ctrl/Cmd+wheel and trackpad pinches zoom the canvas, never the page.
  document.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    post('wheel', { deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, clientX: event.clientX, clientY: event.clientY });
  }, { capture: true, passive: false });

  /* ---------- Scroll, size and sync ---------- */

  let applyingScroll = false;
  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    render();
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (selected && selected.isConnected) post('rect', { id: selectedId, rect: rectOf(selected) });
      if (applyingScroll) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      post('scroll', { ratio: max > 0 ? window.scrollY / max : 0 });
    });
  }, true);
  window.addEventListener('resize', render);

  let lastHeight = 0;
  function reportSize() {
    const body = document.body;
    if (!body) return;
    const style = getComputedStyle(body);
    const height = Math.ceil(body.getBoundingClientRect().height + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0'));
    if (Math.abs(height - lastHeight) < 1) return;
    lastHeight = height;
    post('size', { height });
  }
  new ResizeObserver(reportSize).observe(document.documentElement);

  let syncTimer = null;
  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (editing || pending) return;
      if (selectedId && (!selected || !selected.isConnected || selected.getAttribute(ATTR) !== selectedId)) selected = byId(selectedId);
      if (linkedId && (!linked || !linked.isConnected || linked.getAttribute(ATTR) !== linkedId)) linked = byId(linkedId);
      if (hovered && !hovered.isConnected) hovered = null;
      post('tree', document.body ? buildTree(document.body) : []);
      if (selected) post('select', describe(selected));
      reportSize();
      render();
    }, 80);
  }

  // Mutations caused by the user's own typing arrive in the same task as a beforeinput event.
  let typing = false;
  document.addEventListener('beforeinput', () => {
    typing = true;
    setTimeout(() => (typing = false));
  }, true);

  new MutationObserver((records) => {
    const external = records.filter((r) => r.target !== host && !host.contains(r.target));
    if (editing) {
      const el = editing.el;
      // Only renders that touch the edited element matter; the rest of the page may animate freely.
      const rendered = !el.isConnected || (!typing && external.some((r) => el.contains(r.target) && !(r.type === 'attributes' && r.target === el)));
      if (rendered) editing.stale = true;
      return;
    }
    if (pending || !external.length) return;
    scheduleSync();
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  /* ---------- Bug check ---------- */

  // Errors from before the bridge loaded are collected by a tiny script the preview server puts first in <head>.
  const runtimeErrors = Array.isArray(window.__ocErrors) ? window.__ocErrors : [];
  window.__ocErrors = runtimeErrors;
  const recordError = (entry) => {
    if (runtimeErrors.length < 50 && !runtimeErrors.some((e) => e.kind === entry.kind && e.message === entry.message)) runtimeErrors.push(entry);
  };
  if (!window.__ocErrorsHooked) {
    window.__ocErrorsHooked = true;
    window.addEventListener('error', (event) => {
      const target = event.target;
      if (target && target !== window && (target.src || target.href)) recordError({ kind: 'resource', message: target.src || target.href, tag: target.tagName.toLowerCase() });
      else if (event.message) recordError({ kind: 'error', message: event.message, stack: event.error?.stack || `${event.filename}:${event.lineno}` });
    }, true);
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      recordError({ kind: 'error', message: `Unhandled promise rejection: ${reason?.message || String(reason)}`, stack: reason?.stack || '' });
    });
    const consoleError = console.error.bind(console);
    console.error = (...args) => {
      recordError({ kind: 'console', message: args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ').slice(0, 400) });
      consoleError(...args);
    };
  }

  const visible = (el) => {
    if (host.contains(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const sourceOf = (el) => (el.hasAttribute(ATTR) ? el : sourceParent(el));
  const where = (el) => {
    const src = el && sourceOf(el);
    return src ? { id: src.getAttribute(ATTR), uid: uidOf(src), name: nameOf(src) } : { id: null, uid: null, name: el ? nameOf(el) : null };
  };
  const snippet = (el) => {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  };
  const accessibleName = (el) =>
    (el.getAttribute('aria-label') || '').trim() ||
    (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.trim()) ||
    (el.textContent || '').trim() ||
    (el.getAttribute('title') || '').trim() ||
    [...el.querySelectorAll('img[alt], svg[aria-label]')].map((i) => i.getAttribute('alt') || i.getAttribute('aria-label')).join(' ').trim();

  function parseColor(value) {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  }
  const luminance = ({ r, g, b }) => {
    const ch = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  function backgroundOf(el) {
    for (let node = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parseColor(cs.backgroundColor);
      if (c && c.a >= 0.95) return c;
      if (c && c.a > 0) return null;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function audit() {
    const issues = [];
    const add = (issue, el) => issues.push({ ...issue, ...where(el) });
    const width = window.innerWidth;

    const overlay = document.querySelector('vite-error-overlay');
    if (overlay) {
      const message = overlay.shadowRoot?.querySelector('.message-body')?.textContent?.trim() || 'The page failed to compile.';
      const file = overlay.shadowRoot?.querySelector('.file')?.textContent?.trim() || '';
      add({ rule: 'build-error', severity: 'error', category: 'errors', title: 'The page doesn’t compile', detail: `${file ? `${file}\n` : ''}${message}`.slice(0, 600), fix: 'Open the file named in the message and fix the syntax or import it points to. The page stays blank until it compiles.' });
    }
    // Next.js keeps its dev overlay in a <nextjs-portal>; a dialog inside it means a build or runtime error is showing.
    const nextDialog = document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dialog]');
    const nextText = nextDialog?.textContent?.trim() || '';
    if (/failed to compile|build error|module not found/i.test(nextText)) {
      add({ rule: 'build-error', severity: 'error', category: 'errors', title: 'The page doesn’t compile', detail: nextText.slice(0, 600), fix: 'Open the file named in the message and fix the syntax or import it points to. The page stays blank until it compiles.' });
    }

    for (const e of runtimeErrors) {
      if (e.kind === 'resource') {
        add({ rule: 'failed-resource', severity: 'error', category: 'links', title: `A ${e.tag === 'img' ? 'image' : e.tag === 'script' ? 'script' : 'file'} failed to load`, detail: e.message, fix: 'Check the file exists. Files in public/ are served from the site root, so public/logo.png is "/logo.png".' });
      } else {
        const logged = e.kind === 'console';
        add({ rule: logged ? 'console-error' : 'runtime-error', severity: logged ? 'warning' : 'error', category: 'errors', title: logged ? 'Error logged in the console' : 'JavaScript error', detail: `${e.message}${e.stack ? `\n${String(e.stack).split('\n').slice(0, 4).join('\n')}` : ''}`.slice(0, 700), fix: logged ? 'React logs these for real problems such as missing list keys or invalid props. Read the message and fix the component it names.' : 'Something threw while the page ran, so part of it may not work. The first line of the stack shows the file and line.' });
      }
    }

    const seen = new Set(runtimeErrors.filter((e) => e.kind === 'resource').map((e) => e.message));
    for (const entry of performance.getEntriesByType('resource')) {
      if (entry.responseStatus >= 400 && !seen.has(entry.name)) {
        seen.add(entry.name);
        add({ rule: 'failed-request', severity: 'error', category: 'links', title: `Request failed (${entry.responseStatus})`, detail: entry.name, fix: 'The server answered with an error. Check the URL or path is spelled correctly and the file or API exists.' });
      }
    }

    for (const img of document.images) {
      if (host.contains(img)) continue;
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src') && !seen.has(img.src)) {
        seen.add(img.src);
        add({ rule: 'broken-image', severity: 'error', category: 'links', title: 'Broken image', detail: img.getAttribute('src'), fix: 'The image file can’t be found. Put it in public/ and reference it as "/file.png", or import it from src/.' }, img);
      }
      if (!img.hasAttribute('alt')) add({ rule: 'img-alt', severity: 'warning', category: 'a11y', title: 'Image has no alt text', detail: img.getAttribute('src') || '', fix: 'Add alt="…" describing the image for screen readers, or alt="" if it is purely decorative.' }, img);
    }

    for (const a of document.querySelectorAll('a')) {
      if (host.contains(a) || !visible(a)) continue;
      const href = (a.getAttribute('href') || '').trim();
      if (!href || href === '#' || /^javascript:/i.test(href)) {
        add({ rule: 'empty-link', severity: 'warning', category: 'links', title: 'Link goes nowhere', detail: `“${snippet(a) || 'link'}” has ${href ? `href="${href}"` : 'no href'}.`, fix: 'Point it at a page, a section (#id) or a URL. If it runs an action instead, make it a <button>.' }, a);
      } else if (href.startsWith('#') && href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))) {
        add({ rule: 'missing-anchor', severity: 'warning', category: 'links', title: 'Link points to a missing section', detail: `${href} — no element has id="${href.slice(1)}".`, fix: `Add id="${href.slice(1)}" to the section it should scroll to, or fix the link.` }, a);
      }
    }

    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      if (host.contains(el) || !visible(el)) continue;
      if (!accessibleName(el)) add({ rule: 'control-name', severity: 'warning', category: 'a11y', title: `${el.tagName === 'A' ? 'Link' : 'Button'} has no label`, detail: 'It only shows an icon or nothing, so screen readers announce it as just “button”.', fix: 'Add visible text or aria-label="…" describing what it does.' }, el);
    }

    for (const field of document.querySelectorAll('input, select, textarea')) {
      if (host.contains(field) || !visible(field) || ['hidden', 'submit', 'button', 'reset', 'image'].includes(field.type)) continue;
      const labelled = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') || field.closest('label') || (field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`));
      if (!labelled) add({ rule: 'field-label', severity: 'warning', category: 'a11y', title: 'Form field has no label', detail: field.getAttribute('placeholder') ? `Only a placeholder (“${field.getAttribute('placeholder')}”), which disappears once you type.` : `A ${field.tagName.toLowerCase()} with no label.`, fix: 'Wrap it in a <label> with text, or add aria-label="…".' }, field);
    }

    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => !host.contains(h) && visible(h));
    const h1s = headings.filter((h) => h.tagName === 'H1');
    if (!h1s.length && headings.length) add({ rule: 'no-h1', severity: 'warning', category: 'seo', title: 'Page has no main heading (h1)', fix: 'Make the main page title an <h1>. Search engines and screen readers use it to understand the page.' }, headings[0]);
    if (h1s.length > 1) add({ rule: 'many-h1', severity: 'info', category: 'seo', title: `${h1s.length} main headings (h1)`, detail: h1s.map(snippet).join(' · '), fix: 'Keep one <h1> for the page title and use <h2> for section titles.' }, h1s[1]);
    for (let i = 1; i < headings.length; i++) {
      const prev = Number(headings[i - 1].tagName[1]);
      const cur = Number(headings[i].tagName[1]);
      if (cur > prev + 1) {
        add({ rule: 'heading-order', severity: 'info', category: 'a11y', title: `Heading skips a level (h${prev} → h${cur})`, detail: `“${snippet(headings[i])}”`, fix: `Use <h${prev + 1}> here, and change its size with styles instead of the heading level.` }, headings[i]);
        break;
      }
    }

    let contrastCount = 0;
    const checked = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      if (contrastCount >= 8) break;
      if (host.contains(el) || checked.has(el)) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!visible(el)) continue;
      checked.add(el);
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      const bg = backgroundOf(el);
      if (!fg || !bg || fg.a < 0.95) continue;
      const [l1, l2] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        contrastCount++;
        add({ rule: 'contrast', severity: 'warning', category: 'a11y', title: 'Text is hard to read', detail: `“${snippet(el)}” has a contrast of ${ratio.toFixed(1)}:1 (needs ${min}:1). Text ${cs.color} on ${`rgb(${bg.r}, ${bg.g}, ${bg.b})`}.`, fix: 'Darken the text or lighten the background (or the reverse in dark designs) until it passes.' }, el);
      }
    }

    const doc = document.documentElement;
    if (doc.scrollWidth > width + 1) {
      const culprits = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (culprits.length >= 3) break;
        if (host.contains(el) || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right <= width + 1 && r.left >= -1) continue;
        if (culprits.some((c) => c.contains(el))) continue;
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') {
            clipped = true;
            break;
          }
        }
        if (!clipped) culprits.push(el);
      }
      const detail = `The page is ${doc.scrollWidth}px wide on a ${width}px screen, so it scrolls sideways.`;
      const fix = 'Give it max-width: 100%, let rows wrap (flex-wrap: wrap), or reduce its fixed width or font size at this breakpoint.';
      if (!culprits.length) add({ rule: 'overflow', severity: 'error', category: 'layout', title: 'Page scrolls sideways', detail, fix });
      for (const el of culprits) add({ rule: 'overflow', severity: 'error', category: 'layout', title: 'Element sticks out of the screen', detail: `${detail} “${snippet(el) || nameOf(el)}” reaches ${Math.round(el.getBoundingClientRect().right)}px.`, fix }, el);
    }

    if (width <= 640) {
      let small = 0;
      for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')) {
        if (small >= 4) break;
        if (host.contains(el) || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) {
          small++;
          add({ rule: 'tap-target', severity: 'info', category: 'layout', title: 'Tap target is too small', detail: `“${snippet(el) || accessibleName(el) || nameOf(el)}” is ${Math.round(r.width)}×${Math.round(r.height)}px.`, fix: 'Make it at least 24×24px (44×44px is comfortable) with padding, so it is easy to tap on a phone.' }, el);
        }
      }
    }

    if (!document.title.trim()) add({ rule: 'no-title', severity: 'warning', category: 'seo', title: 'Page has no title', fix: 'Set <title> in index.html. It shows in the browser tab, bookmarks and search results.' });
    if (!document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()) add({ rule: 'no-description', severity: 'info', category: 'seo', title: 'No meta description', fix: 'Add <meta name="description" content="…"> to index.html: one or two sentences that appear under your link in search results.' });
    if (!document.querySelector('meta[name="viewport"]')) add({ rule: 'no-viewport', severity: 'error', category: 'layout', title: 'Missing mobile viewport tag', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to index.html, or phones will show a tiny zoomed-out desktop page.' });
    if (!doc.getAttribute('lang')) add({ rule: 'no-lang', severity: 'info', category: 'a11y', title: 'Page language isn’t set', fix: 'Add lang="en" (or your language) to the <html> tag in index.html so screen readers pronounce it correctly.' });
    if (!document.querySelector('link[rel~="icon"]')) add({ rule: 'no-favicon', severity: 'info', category: 'seo', title: 'No favicon', fix: 'Add an icon to public/ and link it with <link rel="icon" href="/favicon.svg"> in index.html.' });

    return { width, url: location.href, issues };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || msg.source !== 'oc-editor') return;
    switch (msg.type) {
      case 'select': {
        const el = (msg.uid && byUid.get(msg.uid)?.isConnected && byUid.get(msg.uid)) || byId(msg.id) || null;
        if (msg.linked) setLinked(el);
        else select(el, true, false, msg.additive);
        if (el && msg.scroll) scrollWithinPreview(el);
        break;
      }
      case 'hover':
        if (editing) break;
        hovered = (msg.uid && byUid.get(msg.uid)) || byId(msg.id) || null;
        render();
        break;
      case 'measure':
        measureOn = !!msg.on;
        render();
        break;
      case 'mode':
        if (editing) finishEditing(true);
        mode = msg.mode;
        hovered = null;
        render();
        break;
      case 'multi':
        multiIds = Array.isArray(msg.ids) ? msg.ids.filter((id) => typeof id === 'string') : [];
        multiLinked = !!msg.linked;
        render();
        break;
      case 'highlight-token': {
        tokenHighlightKeys = Array.isArray(msg.keys) ? msg.keys.filter((k) => typeof k === 'string') : [];
        tokenHighlightIds = Array.isArray(msg.ids) ? msg.ids.filter((k) => typeof k === 'string') : [];
        tokenHighlightLabel = typeof msg.label === 'string' ? msg.label : '';
        render();
        break;
      }
      case 'zoom': {
        // The frame is CSS-scaled on the canvas; keep the selection stroke and handles a constant screen size.
        const z = Number(msg.zoom);
        if (z > 0) host.style.setProperty('--k', String(Math.min(1 / z, 10)));
        break;
      }
      case 'sync':
        scheduleSync();
        break;
      case 'scrollTo': {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        applyingScroll = true;
        window.scrollTo({ top: Math.max(0, msg.ratio * max) });
        setTimeout(() => (applyingScroll = false), 120);
        break;
      }
      case 'inlineEditStart':
        startEditing(byUid.get(msg.uid) || byId(msg.id));
        break;
      case 'inlineEditStop':
        finishEditing(!!msg.commit);
        break;
      case 'inlineEditResult':
        settlePending(!!msg.ok);
        break;
      case 'reload':
        location.reload();
        break;
      case 'navigate':
        if (typeof msg.path === 'string' && msg.path.startsWith('/') && msg.path !== location.pathname) {
          history.pushState({}, '', msg.path);
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        }
        break;
      case 'audit': {
        let report;
        try {
          report = audit();
        } catch (err) {
          report = { width: window.innerWidth, url: location.href, issues: [], error: String(err?.message || err) };
        }
        post('audit', report, { requestId: msg.requestId });
        break;
      }
      case 'measure-subtree': {
        const root = (msg.id && byId(msg.id)) || (msg.uid && byUid.get(msg.uid)) || selected;
        const boxes = [];
        const walk = (el, depth) => {
          if (!el || !el.getBoundingClientRect) return;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const tag = el.tagName.toLowerCase();
          let kind = 'container';
          if (tag === 'img' || tag === 'svg' || tag === 'video' || tag === 'picture') kind = 'image';
          else if (tag === 'input' || tag === 'button' || tag === 'select' || tag === 'textarea' || tag === 'a') kind = 'control';
          else if (TEXT_TAGS.has(tag) || (el.childNodes.length && [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && TEXT_TAGS.has(n.tagName?.toLowerCase()))))) kind = 'text';
          boxes.push({
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            padding: {
              top: parseFloat(cs.paddingTop) || 0,
              right: parseFloat(cs.paddingRight) || 0,
              bottom: parseFloat(cs.paddingBottom) || 0,
              left: parseFloat(cs.paddingLeft) || 0,
            },
            kind,
            depth,
          });
          for (const child of el.children) {
            if (child === host) continue;
            walk(child, depth + 1);
          }
        };
        if (root) walk(root, 0);
        post('measure-subtree', { boxes }, { requestId: msg.requestId });
        break;
      }
    }
  });

  // Client-side routers change the URL without reloading; report each path so routes that can't be read from code still get listed.
  let lastPath = location.pathname;
  const reportLocation = () => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    post('location', { path: location.pathname });
    scheduleSync();
  };
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      reportLocation();
      return result;
    };
  }
  window.addEventListener('popstate', reportLocation);

  post('ready', { url: location.href });
  post('location', { path: location.pathname });
  scheduleSync();
})();
