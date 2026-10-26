/*
 * Wizualizacja grafu silnika decyzyjnego.
 *
 *   const view = GraphView.create(container, graph);
 *   view.setRun(DecisionEngine.run(graph, input));
 *
 * Rysuje graf (SVG), odtwarza ślad wykonania krok po kroku i pokazuje w panelu
 * algorytm węzła oraz jego dane wejściowe/wyjściowe w wybranej iteracji pętli.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphView = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 184;
  const NODE_H = 60;
  const GAP_X = 56;
  const GAP_Y = 76;
  const LOOP_BULGE = 70;
  const GRID = 20;
  const TYPE_LABEL = {
    input: 'wejście', compute: 'przeliczenie', condition: 'warunek', loop: 'pętla', output: 'wyjście',
  };
  const BRANCH_LABEL = { true: 'tak', false: 'nie' };

  // ---------- układ ----------

  function layout(graph) {
    const edges = graph.edges.map((e, i) => ({ ...e, id: e.id || 'e' + i }));
    const out = new Map(graph.nodes.map((n) => [n.id, []]));
    for (const e of edges) out.get(e.from).push(e);
    const start = graph.start || (graph.nodes.find((n) => n.type === 'input') || graph.nodes[0]).id;

    // DFS: krawędź do węzła na stosie zamyka pętlę – nie wpływa na poziomy.
    const state = {};
    const back = new Set();
    const discovery = [];
    const postorder = [];
    const dfs = (id) => {
      state[id] = 1;
      discovery.push(id);
      for (const e of out.get(id)) {
        if (state[e.to] === 1) back.add(e.id);
        else if (!state[e.to]) dfs(e.to);
      }
      state[id] = 2;
      postorder.push(id);
    };
    dfs(start);
    for (const n of graph.nodes) if (!state[n.id]) dfs(n.id);

    const level = Object.fromEntries(graph.nodes.map((n) => [n.id, 0]));
    for (const id of postorder.slice().reverse()) {
      for (const e of out.get(id)) {
        if (!back.has(e.id)) level[e.to] = Math.max(level[e.to], level[id] + 1);
      }
    }

    const rows = [];
    for (const id of discovery) (rows[level[id]] = rows[level[id]] || []).push(id);
    const pos = {};
    rows.forEach((row, r) => row.forEach((id, i) => {
      pos[id] = { x: (i - (row.length - 1) / 2) * (NODE_W + GAP_X), y: r * (NODE_H + GAP_Y) };
    }));
    for (const n of graph.nodes) if (n.x !== undefined && n.y !== undefined) pos[n.id] = { x: n.x, y: n.y };

    return { pos, edges, back, bounds: boundsOf(pos) };
  }

  function boundsOf(pos) {
    const xs = Object.values(pos).map((p) => p.x);
    const ys = Object.values(pos).map((p) => p.y);
    const pad = LOOP_BULGE + 40;
    return {
      x: Math.min(...xs) - NODE_W / 2 - pad,
      y: Math.min(...ys) - NODE_H / 2 - 30,
      w: Math.max(...xs) - Math.min(...xs) + NODE_W + 2 * pad,
      h: Math.max(...ys) - Math.min(...ys) + NODE_H + 60,
    };
  }

  // Ręczny układ węzłów w localStorage (może być niedostępny – wtedy działa tylko w bieżącej sesji).
  function loadLayout(key) {
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function saveLayout(key, pos) {
    if (!key) return;
    try { if (pos) localStorage.setItem(key, JSON.stringify(pos)); else localStorage.removeItem(key); } catch (e) { /* brak dostępu */ }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
  }

  // ---------- narzędzia ----------

  function svg(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of [].concat(children || []).flat(Infinity)) if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
  }

  const numberFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 4 });

  function fmt(v) {
    if (v === undefined) return '—';
    if (typeof v === 'number') return numberFmt.format(v);
    if (typeof v === 'boolean') return v ? 'prawda' : 'fałsz';
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }

  function shape(type, g) {
    const w = NODE_W / 2;
    const hh = NODE_H / 2;
    if (type === 'condition') {
      return svg('polygon', { points: `0,${-hh - 8} ${w},0 0,${hh + 8} ${-w},0` }, g);
    }
    if (type === 'loop') {
      const c = 22;
      return svg('polygon', { points: `${-w + c},${-hh} ${w - c},${-hh} ${w},0 ${w - c},${hh} ${-w + c},${hh} ${-w},0` }, g);
    }
    const rx = type === 'input' || type === 'output' ? hh : 8;
    return svg('rect', { x: -w, y: -hh, width: NODE_W, height: NODE_H, rx }, g);
  }

  function edgePath(e, pos, back) {
    const a = pos[e.from];
    const b = pos[e.to];
    if (back.has(e.id)) {
      // Łuk powrotny z boku: po stronie, po której leży ciało pętli.
      const side = a.x < b.x ? -1 : a.x > b.x ? 1 : -1;
      const sx = a.x + side * NODE_W / 2;
      const tx = b.x + side * NODE_W / 2;
      const cx = (side < 0 ? Math.min(sx, tx) : Math.max(sx, tx)) + side * LOOP_BULGE;
      return {
        d: `M${sx},${a.y} C${cx},${a.y} ${cx},${b.y} ${tx},${b.y}`,
        label: { x: cx - side * 14, y: (a.y + b.y) / 2 },
      };
    }
    const sy = a.y + NODE_H / 2 + 4;
    const ty = b.y - NODE_H / 2 - 6;
    const my = (sy + ty) / 2;
    return {
      d: `M${a.x},${sy} C${a.x},${my} ${b.x},${my} ${b.x},${ty}`,
      label: { x: (a.x + b.x) / 2, y: my },
    };
  }

  // ---------- komponent ----------

  function create(container, graph, options = {}) {
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
    const L = layout(graph);
    const basePos = JSON.parse(JSON.stringify(L.pos));
    const saved = loadLayout(options.layoutKey);
    if (saved) {
      for (const [id, p] of Object.entries(saved)) if (L.pos[id] && Number.isFinite(p.x) && Number.isFinite(p.y)) L.pos[id] = { x: p.x, y: p.y };
      L.bounds = boundsOf(L.pos);
    }
    let run = null;
    let stepIdx = 0;
    let selectedId = null;
    let selectedIter = null;
    let timer = null;
    let speed = options.speed || 600;

    container.classList.add('gv');
    container.innerHTML = '';

    const stage = h('div', { class: 'gv-stage' });
    const side = h('aside', { class: 'gv-panel' });
    const player = h('div', { class: 'gv-player' });
    container.append(player, h('div', { class: 'gv-main' }, [stage, side]));

    // --- SVG ---
    const root = svg('svg', {
      class: 'gv-svg',
      viewBox: `${L.bounds.x} ${L.bounds.y} ${L.bounds.w} ${L.bounds.h}`,
      role: 'img',
      'aria-label': 'Graf silnika decyzyjnego',
    });
    const canvas = h('div', { class: 'gv-canvas' });
    canvas.appendChild(root);
    stage.appendChild(canvas);

    // Powiększenie: null = dopasuj do szerokości (najwyżej 100%), liczba = skala względem naturalnej wielkości grafu.
    let zoom = null;
    const zoomLabel = h('span', { class: 'gv-zoom-label' });
    const scale = () => root.getBoundingClientRect().width / L.bounds.w || 1;
    const setZoom = (z) => {
      zoom = z === null ? null : Math.max(0.3, Math.min(3, z));
      root.style.maxWidth = zoom === null ? `${L.bounds.w}px` : 'none';
      root.style.width = zoom === null ? '' : `${L.bounds.w * zoom}px`;
      canvas.classList.toggle('is-zoomed', zoom !== null);
      zoomLabel.textContent = `${Math.round(scale() * 100)}%`;
    };
    const zoomBtn = (label, title, fn) => h('button', { type: 'button', class: 'gv-btn', title, 'aria-label': title, onclick: fn, text: label });
    stage.append(h('div', { class: 'gv-zoom' }, [
      zoomBtn('−', 'Pomniejsz', () => setZoom(scale() / 1.25)),
      zoomBtn('Dopasuj', 'Dopasuj do szerokości', () => setZoom(null)),
      zoomBtn('+', 'Powiększ', () => setZoom(scale() * 1.25)),
      zoomLabel,
      h('span', { class: 'gv-zoom-sep' }),
      zoomBtn('Resetuj układ', 'Przywróć automatyczny układ węzłów', resetLayout),
      zoomBtn('Kopiuj pozycje', 'Kopiuj pozycje węzłów (x, y) do wklejenia w definicji grafu', copyPositions),
    ]));
    stage.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      setZoom(scale() * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    setZoom(null);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (zoom === null) setZoom(null); }).observe(canvas);

    const defs = svg('defs', {}, root);
    const grid = svg('pattern', { id: 'gv-grid', width: GRID, height: GRID, patternUnits: 'userSpaceOnUse' }, defs);
    svg('path', { d: `M${GRID},0 L0,0 0,${GRID}`, class: 'gv-grid-line' }, grid);
    svg('rect', { class: 'gv-grid', x: -1e4, y: -1e4, width: 2e4, height: 2e4, fill: 'url(#gv-grid)' }, root);
    for (const kind of ['idle', 'done', 'active']) {
      const m = svg('marker', {
        id: `gv-arrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse',
      }, defs);
      svg('path', { d: 'M0,0 L10,5 L0,10 z', class: `gv-arrow gv-arrow-${kind}` }, m);
    }

    const edgeLayer = svg('g', {}, root);
    const nodeLayer = svg('g', {}, root);
    const edgeEls = {};
    for (const e of L.edges) {
      const p = edgePath(e, L.pos, L.back);
      const g = svg('g', { class: 'gv-edge' + (L.back.has(e.id) ? ' gv-back' : '') }, edgeLayer);
      const path = svg('path', { d: p.d, 'marker-end': 'url(#gv-arrow-idle)' }, g);
      const text = e.label || BRANCH_LABEL[e.branch] || '';
      const lbl = svg('g', { class: 'gv-edge-label', transform: `translate(${p.label.x},${p.label.y})` }, g);
      const bg = svg('rect', { x: -22, y: -11, width: 44, height: 22, rx: 11 }, lbl);
      const t = svg('text', { 'text-anchor': 'middle', dy: '0.35em' }, lbl);
      if (!text) lbl.style.display = 'none';
      edgeEls[e.id] = { g, path, lbl, bg, t, text };
    }
    const edgesByNode = new Map(graph.nodes.map((n) => [n.id, L.edges.filter((e) => e.from === n.id || e.to === n.id)]));

    const nodeEls = {};
    for (const n of graph.nodes) {
      const p = L.pos[n.id];
      const g = svg('g', {
        class: `gv-node gv-${n.type}`, transform: `translate(${p.x},${p.y})`, tabindex: 0,
        role: 'button', 'aria-label': n.label || n.id,
      }, nodeLayer);
      shape(n.type, g);
      svg('text', { class: 'gv-node-type', 'text-anchor': 'middle', y: -8 }, g).textContent = TYPE_LABEL[n.type] || n.type;
      svg('text', { class: 'gv-node-label', 'text-anchor': 'middle', y: 12 }, g).textContent = n.label || n.id;
      const badge = svg('g', { class: 'gv-badge', transform: `translate(${NODE_W / 2 - 8},${-NODE_H / 2})` }, g);
      svg('circle', { r: 12 }, badge);
      const badgeText = svg('text', { 'text-anchor': 'middle', dy: '0.35em' }, badge);
      const select = () => { selectedId = n.id; selectedIter = null; render(); };
      g.addEventListener('click', () => { if (suppressClick) suppressClick = false; else select(); });
      g.addEventListener('pointerdown', (ev) => startDrag(ev, n.id));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(); return; }
        const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
        if (!dir) return;
        ev.preventDefault();
        const step = GRID * (ev.shiftKey ? 5 : 1);
        const p = L.pos[n.id];
        moveNode(n.id, snap(p.x) + dir[0] * step, snap(p.y) + dir[1] * step);
        commitLayout();
      });
      nodeEls[n.id] = { g, badge, badgeText };
    }

    // --- przeciąganie węzłów ---
    let suppressClick = false;
    const snap = (v) => Math.round(v / GRID) * GRID;
    const toSvg = (ev) => new DOMPoint(ev.clientX, ev.clientY).matrixTransform(root.getScreenCTM().inverse());

    function moveNode(id, x, y) {
      L.pos[id] = { x, y };
      nodeEls[id].g.setAttribute('transform', `translate(${x},${y})`);
      for (const e of edgesByNode.get(id)) {
        const p = edgePath(e, L.pos, L.back);
        edgeEls[e.id].path.setAttribute('d', p.d);
        edgeEls[e.id].lbl.setAttribute('transform', `translate(${p.label.x},${p.label.y})`);
      }
    }

    // Po upuszczeniu: dopasuj obszar rysunku do nowych pozycji i zapamiętaj układ.
    function commitLayout(reset) {
      L.bounds = boundsOf(L.pos);
      root.setAttribute('viewBox', `${L.bounds.x} ${L.bounds.y} ${L.bounds.w} ${L.bounds.h}`);
      setZoom(zoom);
      saveLayout(options.layoutKey, reset ? null : L.pos);
    }

    function startDrag(ev, id) {
      if (ev.button !== 0) return;
      suppressClick = false;
      const g = nodeEls[id].g;
      const from = toSvg(ev);
      const orig = { ...L.pos[id] };
      let moved = false;
      g.setPointerCapture(ev.pointerId);
      const move = (e) => {
        if (!moved && Math.hypot(e.clientX - ev.clientX, e.clientY - ev.clientY) < 4) return;
        if (!moved) { moved = true; root.classList.add('is-dragging'); g.classList.add('is-dragging'); }
        const p = toSvg(e);
        moveNode(id, snap(orig.x + p.x - from.x), snap(orig.y + p.y - from.y));
      };
      const end = () => {
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', end);
        g.removeEventListener('pointercancel', end);
        if (!moved) return;
        suppressClick = true;
        root.classList.remove('is-dragging');
        g.classList.remove('is-dragging');
        commitLayout();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', end);
      g.addEventListener('pointercancel', end);
    }

    function resetLayout() {
      for (const [id, p] of Object.entries(basePos)) moveNode(id, p.x, p.y);
      commitLayout(true);
    }

    function copyPositions(ev) {
      const btnEl = ev.currentTarget;
      const text = JSON.stringify(Object.fromEntries(graph.nodes.map((n) => [n.id, L.pos[n.id]])), null, 2);
      const flash = (msg) => { btnEl.textContent = msg; setTimeout(() => { btnEl.textContent = 'Kopiuj pozycje'; }, 1500); };
      copyText(text).then(() => flash('Skopiowano'), () => flash('Brak dostępu do schowka'));
    }

    // --- odtwarzacz ---
    const btn = (label, title, fn) => h('button', { type: 'button', class: 'gv-btn', title, 'aria-label': title, onclick: fn, text: label });
    const playBtn = btn('▶', 'Odtwarzaj', () => (timer ? stop() : play()));
    const slider = h('input', { type: 'range', min: 0, max: 0, value: 0, class: 'gv-slider', 'aria-label': 'Krok wykonania' });
    slider.addEventListener('input', () => { stop(); goTo(Number(slider.value)); });
    const stepLabel = h('span', { class: 'gv-step-label' });
    const speedSel = h('select', { class: 'gv-speed', 'aria-label': 'Prędkość' },
      [['1200', '0,5×'], ['600', '1×'], ['250', '2×'], ['80', '5×']].map(([v, t]) => {
        const o = h('option', { value: v, text: t });
        if (Number(v) === speed) o.selected = true;
        return o;
      }));
    speedSel.addEventListener('change', () => { speed = Number(speedSel.value); if (timer) { stop(); play(); } });
    player.append(
      btn('⏮', 'Pierwszy krok', () => { stop(); goTo(0); }),
      btn('◀', 'Poprzedni krok', () => { stop(); goTo(stepIdx - 1); }),
      playBtn,
      btn('▶|', 'Następny krok', () => { stop(); goTo(stepIdx + 1); }),
      btn('⏭', 'Ostatni krok', () => { stop(); goTo(run ? run.trace.length - 1 : 0); }),
      slider, stepLabel, speedSel,
    );

    function play() {
      if (!run) return;
      if (stepIdx >= run.trace.length - 1) goTo(0);
      playBtn.textContent = '⏸';
      playBtn.title = 'Pauza';
      timer = setInterval(() => {
        if (stepIdx >= run.trace.length - 1) stop();
        else goTo(stepIdx + 1);
      }, speed);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      playBtn.textContent = '▶';
      playBtn.title = 'Odtwarzaj';
    }

    function goTo(i) {
      if (!run) return;
      stepIdx = Math.max(0, Math.min(run.trace.length - 1, i));
      selectedId = null;
      selectedIter = null;
      render();
    }

    // --- render ---
    function render() {
      const trace = run ? run.trace : [];
      const upto = trace.slice(0, stepIdx + 1);
      const current = upto[upto.length - 1];
      const visits = {};
      for (const s of upto) visits[s.nodeId] = (visits[s.nodeId] || 0) + 1;
      const edgeCounts = {};
      for (const s of upto.slice(0, -1)) if (s.edgeId) edgeCounts[s.edgeId] = (edgeCounts[s.edgeId] || 0) + 1;
      const activeEdge = upto.length > 1 ? upto[upto.length - 2].edgeId : null;

      for (const [id, el] of Object.entries(nodeEls)) {
        const n = visits[id] || 0;
        el.g.classList.toggle('is-visited', n > 0);
        el.g.classList.toggle('is-current', !!current && current.nodeId === id);
        el.g.classList.toggle('is-error', !!current && current.nodeId === id && !!current.error);
        el.g.classList.toggle('is-selected', (selectedId || (current && current.nodeId)) === id);
        el.badge.style.display = n ? '' : 'none';
        el.badgeText.textContent = n > 99 ? '99+' : String(n);
      }
      for (const [id, el] of Object.entries(edgeEls)) {
        const n = edgeCounts[id] || 0;
        const kind = id === activeEdge ? 'active' : n ? 'done' : 'idle';
        el.g.setAttribute('class', `gv-edge gv-edge-${kind}` + (L.back.has(id) ? ' gv-back' : ''));
        el.path.setAttribute('marker-end', `url(#gv-arrow-${kind})`);
        const text = [el.text, n ? `×${n}` : ''].filter(Boolean).join(' ');
        el.lbl.style.display = text ? '' : 'none';
        el.t.textContent = text;
        const w = Math.max(30, text.length * 7.5 + 16);
        el.bg.setAttribute('x', -w / 2);
        el.bg.setAttribute('width', w);
      }

      slider.max = Math.max(0, trace.length - 1);
      slider.value = stepIdx;
      stepLabel.textContent = run ? `krok ${stepIdx + 1} / ${trace.length}` : 'brak wykonania';
      renderPanel(upto, current);
    }

    function renderPanel(upto, current) {
      side.innerHTML = '';
      const nodeId = selectedId || (current && current.nodeId) || graph.start || graph.nodes[0].id;
      const node = nodesById.get(nodeId);
      const steps = upto.filter((s) => s.nodeId === nodeId);
      const iter = selectedIter ?? (steps.length ? steps[steps.length - 1].iteration : null);
      const step = steps.find((s) => s.iteration === iter);

      side.append(h('header', { class: 'gv-panel-head' }, [
        h('span', { class: `gv-chip gv-chip-${node.type}`, text: TYPE_LABEL[node.type] || node.type }),
        h('h2', { text: node.label || node.id }),
        node.description ? h('p', { class: 'gv-muted', text: node.description }) : null,
      ]));

      side.append(section('Algorytm', algorithm(node)));

      if (!steps.length) {
        side.append(h('p', { class: 'gv-muted', text: run ? 'Węzeł nie został jeszcze wykonany na tym etapie.' : 'Uruchom silnik, aby zobaczyć dane.' }));
        return;
      }

      if (steps.length > 1) {
        const chips = h('div', { class: 'gv-iters', role: 'tablist', 'aria-label': 'Iteracje' }, steps.map((s) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(s.iteration === iter),
          class: 'gv-iter' + (s.iteration === iter ? ' is-on' : ''), text: String(s.iteration),
          title: `Iteracja ${s.iteration} (krok ${s.step + 1})`,
          onclick: () => { selectedId = nodeId; selectedIter = s.iteration; render(); },
        })));
        side.append(section(`Iteracje (${steps.length})`, chips));
      }

      const meta = [`krok ${step.step + 1}`, `iteracja ${step.iteration}`];
      if (step.branch) meta.push(`wynik: ${BRANCH_LABEL[step.branch]}`);
      side.append(section('Wejście → wyjście', [
        h('p', { class: 'gv-muted', text: meta.join(' · ') }),
        step.error ? h('p', { class: 'gv-error', text: step.error }) : null,
        ioTable(step, node),
      ]));

      if (steps.length > 1) side.append(section('Historia zmiennych w pętli', historyTable(steps, node)));

      if (node.type === 'output' && run && run.result && stepIdx === run.trace.length - 1) {
        side.append(section('Wynik', h('pre', { class: 'gv-pre', text: JSON.stringify(run.result, null, 2) })));
      }
    }

    function section(title, body) {
      return h('section', { class: 'gv-section' }, [h('h3', { text: title })].concat(body));
    }

    function algorithm(node) {
      if (node.type === 'compute') {
        return h('ol', { class: 'gv-code' }, Object.entries(node.assign || {}).map(([k, expr]) =>
          h('li', {}, [h('b', { text: k }), ' = ', h('code', { text: expr })])));
      }
      if (node.type === 'condition' || node.type === 'loop') {
        return h('div', { class: 'gv-code' }, [
          node.type === 'loop' ? 'dopóki ' : 'jeżeli ', h('code', { text: node.condition }),
          h('div', { class: 'gv-muted', text: node.type === 'loop' ? 'tak → ciało pętli, nie → wyjście z pętli' : 'tak / nie → odpowiednia gałąź' }),
        ]);
      }
      if (node.type === 'input') {
        const parts = [];
        if (node.required) parts.push(h('div', {}, ['wymagane: ', h('code', { text: node.required.join(', ') })]));
        if (node.defaults) parts.push(h('div', {}, ['domyślne: ', h('code', { text: JSON.stringify(node.defaults) })]));
        return h('div', { class: 'gv-code' }, parts.length ? parts : 'przekazuje dane wejściowe');
      }
      if (node.type === 'output') {
        return h('div', { class: 'gv-code' }, ['zwraca: ', h('code', { text: (node.fields || ['cały kontekst']).join(', ') })]);
      }
      return h('div', { class: 'gv-muted', text: '—' });
    }

    // Zmienne, których dotyczy węzeł: przypisywane, użyte w wyrażeniach oraz zmienione.
    function relevantKeys(node, step) {
      const all = Object.keys(step.output);
      const exprs = [node.condition, ...Object.values(node.assign || {})].filter(Boolean).join(' ');
      const used = all.filter((k) => new RegExp(`\\b${k.replace(/[$]/g, '\\$')}\\b`).test(exprs));
      const keys = new Set([...Object.keys(node.assign || {}), ...used, ...step.changed, ...(node.fields || [])]);
      return node.type === 'input' ? all : all.filter((k) => keys.has(k));
    }

    function ioTable(step, node) {
      const keys = relevantKeys(node, step);
      const others = Object.keys(step.output).filter((k) => !keys.includes(k));
      const table = h('table', { class: 'gv-table' }, [
        h('thead', {}, h('tr', {}, [h('th', { text: 'zmienna' }), h('th', { text: 'wejście' }), h('th', { text: 'wyjście' })])),
        h('tbody', {}, keys.map((k) => {
          const changed = step.changed.includes(k);
          return h('tr', { class: changed ? 'is-changed' : '' }, [
            h('th', { scope: 'row', text: k }),
            h('td', { text: fmt(step.input[k]) }),
            h('td', { text: fmt(step.output[k]) }),
          ]);
        })),
      ]);
      if (!others.length) return table;
      const rest = h('details', { class: 'gv-rest' }, [
        h('summary', { text: `pozostały kontekst (${others.length})` }),
        h('table', { class: 'gv-table' }, h('tbody', {}, others.map((k) =>
          h('tr', {}, [h('th', { scope: 'row', text: k }), h('td', { text: fmt(step.output[k]) })])))),
      ]);
      return [table, rest];
    }

    function historyTable(steps, node) {
      const keys = [...new Set(steps.flatMap((s) => relevantKeys(node, s)))];
      const isBranch = node.type === 'condition' || node.type === 'loop';
      const wrap = h('div', { class: 'gv-scroll' }, h('table', { class: 'gv-table gv-history' }, [
        h('thead', {}, h('tr', {}, [h('th', { text: '#' })].concat(keys.map((k) => h('th', { text: k })), isBranch ? [h('th', { text: 'gałąź' })] : []))),
        h('tbody', {}, steps.map((s) => h('tr', {
          class: s.iteration === (selectedIter ?? steps[steps.length - 1].iteration) ? 'is-on' : '',
          onclick: () => { selectedId = node.id; selectedIter = s.iteration; render(); },
        }, [h('th', { scope: 'row', text: String(s.iteration) })]
          .concat(keys.map((k) => h('td', { class: s.changed.includes(k) ? 'is-changed' : '', text: fmt(s.output[k]) })),
            isBranch ? [h('td', { text: BRANCH_LABEL[s.branch] || '—' })] : [])))),
      ]));
      return wrap;
    }

    render();

    return {
      setRun(r) { stop(); run = r; stepIdx = r && options.startAt === 'first' ? 0 : r ? r.trace.length - 1 : 0; selectedId = null; selectedIter = null; render(); },
      goTo,
      play,
      stop,
      select(id, iteration) { selectedId = id; selectedIter = iteration ?? null; render(); },
      destroy() { stop(); container.innerHTML = ''; container.classList.remove('gv'); },
    };
  }

  return { create, layout };
});
