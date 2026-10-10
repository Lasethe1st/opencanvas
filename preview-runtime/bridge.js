// Injected into the preview iframe by the Open Canvas preview server only.
// Communicates with the editor exclusively through postMessage.
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

  let mode = 'select';
  let selected = null;
  let selectedId = null;
  let hovered = null;
  let uidCounter = 0;
  const uids = new WeakMap();
  const byUid = new Map();

  const post = (type, payload) => window.parent.postMessage({ source: SOURCE, type, payload }, '*');

  const host = document.createElement('div');
  host.setAttribute('data-oc-overlay', '');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .box { position: fixed; box-sizing: border-box; pointer-events: none; display: none; }
      .hover { border: 1px solid rgba(59,130,246,.75); }
      .select { border: 2px solid #3b82f6; }
      .label { position: absolute; left: -2px; top: -22px; font: 500 11px/1 system-ui, sans-serif; color: #fff;
        background: #3b82f6; padding: 4px 6px; border-radius: 4px; white-space: nowrap; }
      .hover .label { background: rgba(59,130,246,.85); }
      .label.below { top: auto; bottom: -22px; }
      .handle { position: absolute; width: 7px; height: 7px; background: #fff; border: 1.5px solid #3b82f6; border-radius: 2px; }
      .tl { left: -5px; top: -5px; } .tr { right: -5px; top: -5px; } .bl { left: -5px; bottom: -5px; } .br { right: -5px; bottom: -5px; }
    </style>
    <div class="box hover"><span class="label"></span></div>
    <div class="box select"><span class="label"></span>
      <span class="handle tl"></span><span class="handle tr"></span><span class="handle bl"></span><span class="handle br"></span>
    </div>`;
  const hoverBox = shadow.querySelector('.hover');
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

  function describe(el) {
    const cs = getComputedStyle(el);
    const computed = {};
    for (const prop of STYLE_PROPS) computed[prop] = cs.getPropertyValue(prop);
    const r = el.getBoundingClientRect();
    const parent = sourceParent(el);
    return {
      id: el.getAttribute(ATTR),
      uid: uidOf(el),
      tag: el.tagName.toLowerCase(),
      name: nameOf(el),
      parentId: parent ? parent.getAttribute(ATTR) : null,
      computed,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
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
    label.textContent = text;
    label.classList.toggle('below', r.top < 24);
  }

  function render() {
    attachOverlay();
    const showHover = mode === 'select' && hovered && hovered !== selected;
    place(hoverBox, showHover ? hovered : null, hovered ? `${nameOf(hovered)} · ${hovered.tagName.toLowerCase()}` : '');
    place(selectBox, mode === 'select' ? selected : null, selected ? `${nameOf(selected)} · ${Math.round(selected.getBoundingClientRect().width)}×${Math.round(selected.getBoundingClientRect().height)}` : '');
  }

  function target(event) {
    const el = event.target instanceof Element ? event.target.closest(`[${ATTR}]`) : null;
    return el;
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

  function select(el, notify = true) {
    selected = el;
    selectedId = el ? el.getAttribute(ATTR) : null;
    render();
    if (notify) post('select', el ? describe(el) : null);
  }

  document.addEventListener('mousemove', (event) => {
    if (mode !== 'select') return;
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
      event.preventDefault();
      event.stopPropagation();
      if (type === 'click') select(target(event));
    }, true);
  }

  window.addEventListener('keydown', (event) => {
    if (mode !== 'select') return;
    const meta = event.metaKey || event.ctrlKey;
    if (event.key === 'Escape') select(null);
    else if ((meta && /^[zy]$/i.test(event.key)) || event.key === 'Delete' || event.key === 'Backspace') {
      post('key', { key: event.key, meta, shift: event.shiftKey });
      event.preventDefault();
    }
  }, true);

  window.addEventListener('scroll', render, true);
  window.addEventListener('resize', render);

  let pending = null;
  function scheduleSync() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      if (selectedId && (!selected || !selected.isConnected || selected.getAttribute(ATTR) !== selectedId)) {
        selected = document.querySelector(`[${ATTR}="${CSS.escape(selectedId)}"]`);
      }
      if (hovered && !hovered.isConnected) hovered = null;
      post('tree', buildTree(document.body));
      if (selected) post('select', describe(selected));
      render();
    }, 80);
  }

  new MutationObserver((records) => {
    if (records.every((r) => r.target === host || host.contains(r.target))) return;
    scheduleSync();
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || msg.source !== 'oc-editor') return;
    if (msg.type === 'select') {
      const el = (msg.uid && byUid.get(msg.uid)?.isConnected && byUid.get(msg.uid)) || (msg.id && document.querySelector(`[${ATTR}="${CSS.escape(msg.id)}"]`)) || null;
      select(el, true);
      if (el && msg.scroll) scrollWithinPreview(el);
    } else if (msg.type === 'hover') {
      hovered = (msg.uid && byUid.get(msg.uid)) || (msg.id && document.querySelector(`[${ATTR}="${CSS.escape(msg.id)}"]`)) || null;
      render();
    } else if (msg.type === 'mode') {
      mode = msg.mode;
      hovered = null;
      render();
    } else if (msg.type === 'sync') {
      scheduleSync();
    }
  });

  post('ready', { url: location.href });
  scheduleSync();
})();
