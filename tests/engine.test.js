const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/engine.js');
const { layout } = require('../src/visualizer.js');
const examples = require('../src/examples.js');

test('kredyt: pętla wykonuje się okresMies razy i kończy akceptacją', () => {
  const { graph, input } = examples.credit;
  const r = run(graph, input);
  assert.equal(r.status, 'ok');
  assert.equal(r.visits.miesiac, input.okresMies);
  assert.equal(r.visits.petla, input.okresMies + 1);
  assert.ok(r.context.saldo <= 0.01);
  assert.deepEqual(Object.keys(r.result), ['rata', 'odsetkiSuma', 'koszt', 'score']);
  assert.equal(r.trace.at(-1).nodeId, 'akceptacja');
});

test('ślad zawiera wejście, wyjście i zmienione zmienne każdej iteracji', () => {
  const { graph, input } = examples.credit;
  const steps = run(graph, input).trace.filter((s) => s.nodeId === 'miesiac');
  assert.equal(steps[0].iteration, 1);
  assert.equal(steps[0].input.saldo, input.kwota);
  assert.ok(steps[0].output.saldo < input.kwota);
  assert.ok(steps[0].changed.includes('saldo'));
  assert.equal(steps[1].input.saldo, steps[0].output.saldo);
});

test('warunek wybiera gałąź "false" przy wysokim DTI', () => {
  const r = run(examples.credit.graph, { ...examples.credit.input, dochod: 2000 });
  assert.equal(r.trace.find((s) => s.nodeId === 'czyDti').branch, 'false');
  assert.equal(r.trace.at(-1).nodeId, 'odmowa');
});

test('brak wymaganych danych kończy się błędem w węźle wejścia', () => {
  const r = run(examples.credit.graph, { dochod: 5000 });
  assert.equal(r.status, 'error');
  assert.match(r.trace[0].error, /kwota/);
});

test('nieskończona pętla jest przerywana limitem kroków', () => {
  const graph = {
    nodes: [
      { id: 'a', type: 'input' },
      { id: 'l', type: 'loop', condition: 'true' },
      { id: 'b', type: 'compute', assign: { x: 'x + 1' } },
      { id: 'o', type: 'output' },
    ],
    edges: [{ from: 'a', to: 'l' }, { from: 'l', to: 'b', branch: 'true' }, { from: 'b', to: 'l' }, { from: 'l', to: 'o', branch: 'false' }],
  };
  const r = run(graph, { x: 0 }, { maxSteps: 50 });
  assert.equal(r.status, 'limit');
  assert.equal(r.trace.length, 50);
});

test('rabat: zagnieżdżony warunek w pętli', () => {
  const r = run(examples.discount.graph, examples.discount.input);
  assert.equal(r.status, 'ok');
  assert.equal(r.visits.plus, 3);
  assert.equal(r.visits.bonusKrok, 2);
  assert.equal(r.result.cenaKoncowa, 1000 * 0.94 - 40);
});

test('układ: krawędzie powrotne pętli są wykrywane', () => {
  const L = layout(examples.discount.graph);
  const backs = L.edges.filter((e) => L.back.has(e.id)).map((e) => `${e.from}->${e.to}`);
  assert.deepEqual(backs.sort(), ['bonusKrok->loop', 'plus->loop']);
  assert.ok(L.pos.parzysty.y > L.pos.loop.y);
});
