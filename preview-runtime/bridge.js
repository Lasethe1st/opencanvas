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
      .select { border: 2px solid #3b82f6; }
      .linked { border: 1px dashed rgba(59,130,246,.55); }
      .editing { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.18); }
      .label { position: absolute; left: -2px; top: -21px; font: 500 11px/1 Inter, system-ui, sans-serif; color: #fff;
        background: #3b82f6; padding: 4px 6px; border-radius: 4px; white-space: nowrap; }
      .hover .label { background: rgba(59,130,246,.85); }
      .label.below { top: auto; bottom: -21px; }
      .linked .label, .editing .label { display: none; }
    </style>
    <div class="box hover"><span class="label"></span></div>
    <div class="box linked"></div>
    <div class="box select"><span class="label"></span></div>`;
  const hoverBox = shadow.querySelector('.hover');
  const linkedBox = shadow.querySelector('.linked');
  const selectBox = shadow.querySelector('.select');

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

  function render() {
    attachOverlay();
    const active = mode === 'select';
    const showHover = active && !editing && hovered && hovered !== selected;
    place(hoverBox, showHover ? hovered : null, hovered ? `${nameOf(hovered)} · ${hovered.tagName.toLowerCase()}` : '');
    place(linkedBox, active && !selected ? linked : null, '');
    const size = selected && selected.isConnected ? selected.getBoundingClientRect() : null;
    place(selectBox, active ? selected : null, selected && size ? `${nameOf(selected)} · ${Math.round(size.width)}×${Math.round(size.height)}` : '');
    selectBox.classList.toggle('editing', !!editing);
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
  function select(el, notify = true, user = false) {
    if (editing && editing.el !== el) finishEditing(true);
    selected = el;
    selectedId = el ? el.getAttribute(ATTR) : null;
    linked = null;
    linkedId = null;
    render();
    if (notify) post('select', el ? describe(el) : null, { user });
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
      if (type === 'click') select(target(event), true, true);
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

  for (const type of ['drop', 'dragover']) {
    document.addEventListener(type, (event) => {
      if (editing) event.preventDefault();
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
    else if (
      (meta && /^[zy]$/i.test(event.key)) ||
      (meta && ['=', '+', '-', '0'].includes(event.key)) ||
      (event.shiftKey && ['!', '@', '1', '2'].includes(event.key)) ||
      event.key === 'Delete' ||
      event.key === 'Backspace'
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

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || msg.source !== 'oc-editor') return;
    switch (msg.type) {
      case 'select': {
        const el = (msg.uid && byUid.get(msg.uid)?.isConnected && byUid.get(msg.uid)) || byId(msg.id) || null;
        if (msg.linked) setLinked(el);
        else select(el, true);
        if (el && msg.scroll) scrollWithinPreview(el);
        break;
      }
      case 'hover':
        if (editing) break;
        hovered = (msg.uid && byUid.get(msg.uid)) || byId(msg.id) || null;
        render();
        break;
      case 'mode':
        if (editing) finishEditing(true);
        mode = msg.mode;
        hovered = null;
        render();
        break;
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
    }
  });

  post('ready', { url: location.href });
  scheduleSync();
})();
