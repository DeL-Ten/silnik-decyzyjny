/*
 * Silnik decyzyjny oparty na grafie.
 *
 * Graf: { start?, nodes: [...], edges: [...] }
 *   node.type:
 *     input     – dane wejściowe; `defaults` uzupełnia brakujące pola, `required` je waliduje
 *     compute   – algorytm przeliczenia; `assign` = { zmienna: "wyrażenie" } liczone po kolei
 *     condition – rozgałęzienie; `condition` = "wyrażenie", wybiera krawędź branch "true"/"false"
 *     loop      – jak condition, ale oznacza pętlę: "true" = ciało pętli, "false" = wyjście
 *     output    – wynik; `fields` = lista zmiennych zwracanych w `result` (domyślnie cały kontekst)
 *   edge: { id?, from, to, branch?: "true" | "false", label? }
 *
 * Wyrażenia to zaufany kod JS z definicji grafu; mają dostęp do zmiennych kontekstu
 * oraz funkcji pomocniczych: min, max, abs, round, floor, ceil, pow, sqrt, log, exp, clamp.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DecisionEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HELPERS = Object.freeze({
    min: Math.min, max: Math.max, abs: Math.abs, round: Math.round,
    floor: Math.floor, ceil: Math.ceil, pow: Math.pow, sqrt: Math.sqrt,
    log: Math.log, exp: Math.exp,
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  });

  const compiled = new Map();

  function compile(expr) {
    let fn = compiled.get(expr);
    if (!fn) {
      // Function() tworzy funkcję w trybie nie-ścisłym, więc `with` jest dozwolone.
      fn = new Function('scope', 'with (scope) { return (' + expr + '); }');
      compiled.set(expr, fn);
    }
    return fn;
  }

  function evaluate(expr, ctx) {
    const scope = Object.assign(Object.create(HELPERS), ctx);
    return compile(String(expr))(scope);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function changedKeys(before, after) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  }

  function normalize(graph) {
    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const edges = graph.edges.map((e, i) => ({ ...e, id: e.id || 'e' + i }));
    const outgoing = new Map(graph.nodes.map((n) => [n.id, []]));
    for (const e of edges) {
      if (!nodes.has(e.from) || !nodes.has(e.to)) {
        throw new Error(`Krawędź ${e.id} wskazuje nieistniejący węzeł (${e.from} → ${e.to})`);
      }
      outgoing.get(e.from).push(e);
    }
    const start = graph.start || (graph.nodes.find((n) => n.type === 'input') || graph.nodes[0]).id;
    return { nodes, edges, outgoing, start };
  }

  function runNode(node, ctx) {
    switch (node.type) {
      case 'input': {
        const next = { ...(node.defaults || {}), ...ctx };
        const missing = (node.required || []).filter((k) => next[k] === undefined || next[k] === '');
        if (missing.length) throw new Error('Brak wymaganych danych: ' + missing.join(', '));
        return { ctx: next };
      }
      case 'compute': {
        const next = { ...ctx };
        for (const [key, expr] of Object.entries(node.assign || {})) next[key] = evaluate(expr, next);
        return { ctx: next };
      }
      case 'condition':
      case 'loop':
        return { ctx, branch: evaluate(node.condition, ctx) ? 'true' : 'false' };
      case 'output': {
        const fields = node.fields || Object.keys(ctx);
        const result = Object.fromEntries(fields.map((k) => [k, ctx[k]]));
        return { ctx, result };
      }
      default:
        throw new Error(`Nieznany typ węzła "${node.type}" (${node.id})`);
    }
  }

  /**
   * Wykonuje graf i zwraca pełny ślad: dla każdego kroku dane wejściowe i wyjściowe węzła,
   * zmienione zmienne, wybraną gałąź, użytą krawędź i numer iteracji (odwiedzin) węzła.
   */
  function run(graph, input, options = {}) {
    const maxSteps = options.maxSteps ?? 1000;
    const g = normalize(graph);
    const trace = [];
    const visits = {};
    const edgeCounts = {};
    let ctx = clone(input || {});
    let current = g.start;
    let status = 'ok';
    let result = null;
    let error = null;

    while (current) {
      if (trace.length >= maxSteps) {
        status = 'limit';
        error = `Przekroczono limit ${maxSteps} kroków – możliwa nieskończona pętla w węźle ${current}`;
        break;
      }
      const node = g.nodes.get(current);
      visits[node.id] = (visits[node.id] || 0) + 1;
      const step = {
        step: trace.length,
        nodeId: node.id,
        iteration: visits[node.id],
        input: clone(ctx),
        output: null,
        changed: [],
        branch: null,
        edgeId: null,
        error: null,
      };
      trace.push(step);

      try {
        const out = runNode(node, ctx);
        ctx = out.ctx;
        step.branch = out.branch ?? null;
        if (out.result) result = clone(out.result);
      } catch (e) {
        step.error = e.message;
        status = 'error';
        error = `${node.label || node.id}: ${e.message}`;
      }
      step.output = clone(ctx);
      step.changed = changedKeys(step.input, step.output);
      if (status === 'error') break;

      const candidates = g.outgoing.get(node.id);
      const edge = step.branch
        ? candidates.find((e) => e.branch === step.branch)
        : candidates.find((e) => !e.branch) || candidates[0];
      if (step.branch && !edge && candidates.length) {
        status = 'error';
        error = `${node.label || node.id}: brak krawędzi dla gałęzi "${step.branch}"`;
        step.error = error;
        break;
      }
      if (edge) {
        step.edgeId = edge.id;
        edgeCounts[edge.id] = (edgeCounts[edge.id] || 0) + 1;
      }
      current = edge ? edge.to : null;
    }

    return { status, error, result, context: ctx, trace, visits, edgeCounts };
  }

  return { run, evaluate, normalize, HELPERS };
});
