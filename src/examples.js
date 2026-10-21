/* Przykładowe grafy do demonstracji wizualizacji. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DecisionExamples = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const credit = {
    name: 'Wniosek kredytowy – symulacja spłaty',
    input: { dochod: 9000, zobowiazania: 1500, kwota: 24000, okresMies: 12, oprocentowanie: 0.09 },
    graph: {
      start: 'wniosek',
      nodes: [
        { id: 'wniosek', type: 'input', label: 'Wniosek', required: ['dochod', 'kwota', 'okresMies'], defaults: { zobowiazania: 0, oprocentowanie: 0.1 } },
        {
          id: 'wskazniki', type: 'compute', label: 'Wskaźniki',
          description: 'Rata annuitetowa i obciążenie dochodu (DTI).',
          assign: {
            r: 'oprocentowanie / 12',
            rata: 'round(kwota * r / (1 - pow(1 + r, -okresMies)) * 100) / 100',
            dti: 'round((zobowiazania + rata) / dochod * 1000) / 1000',
          },
        },
        { id: 'czyDti', type: 'condition', label: 'DTI ≤ 50%?', condition: 'dti <= 0.5' },
        { id: 'odmowa', type: 'output', label: 'Odmowa', fields: ['dti', 'rata'] },
        { id: 'init', type: 'compute', label: 'Start symulacji', assign: { saldo: 'kwota', miesiac: '0', odsetkiSuma: '0' } },
        { id: 'petla', type: 'loop', label: 'Saldo > 0?', condition: 'saldo > 0.01 && miesiac < okresMies' },
        {
          id: 'miesiac', type: 'compute', label: 'Miesiąc spłaty',
          description: 'Jedna iteracja harmonogramu: odsetki, spłata kapitału, nowe saldo.',
          assign: {
            miesiac: 'miesiac + 1',
            odsetki: 'round(saldo * r * 100) / 100',
            kapital: 'min(saldo, rata - odsetki)',
            saldo: 'round((saldo - kapital) * 100) / 100',
            odsetkiSuma: 'round((odsetkiSuma + odsetki) * 100) / 100',
          },
        },
        {
          id: 'scoring', type: 'compute', label: 'Scoring',
          assign: {
            koszt: 'round(odsetkiSuma / kwota * 1000) / 10',
            score: 'round(clamp(100 - dti * 120 - koszt, 0, 100))',
          },
        },
        { id: 'czyScore', type: 'condition', label: 'Score ≥ 40?', condition: 'score >= 40' },
        { id: 'akceptacja', type: 'output', label: 'Akceptacja', fields: ['rata', 'odsetkiSuma', 'koszt', 'score'] },
        { id: 'weryfikacja', type: 'output', label: 'Weryfikacja ręczna', fields: ['score', 'dti'] },
      ],
      edges: [
        { from: 'wniosek', to: 'wskazniki' },
        { from: 'wskazniki', to: 'czyDti' },
        { from: 'czyDti', to: 'init', branch: 'true' },
        { from: 'czyDti', to: 'odmowa', branch: 'false' },
        { from: 'init', to: 'petla' },
        { from: 'petla', to: 'miesiac', branch: 'true' },
        { from: 'miesiac', to: 'petla' },
        { from: 'petla', to: 'scoring', branch: 'false' },
        { from: 'scoring', to: 'czyScore' },
        { from: 'czyScore', to: 'akceptacja', branch: 'true' },
        { from: 'czyScore', to: 'weryfikacja', branch: 'false' },
      ],
    },
  };

  const discount = {
    name: 'Rabat – pętla z warunkiem zagnieżdżonym',
    input: { cena: 1000, progi: 5, prog: 200 },
    graph: {
      nodes: [
        { id: 'in', type: 'input', label: 'Koszyk', required: ['cena'] },
        { id: 'init', type: 'compute', label: 'Inicjalizacja', assign: { i: '0', rabat: '0', bonus: '0' } },
        { id: 'loop', type: 'loop', label: 'i < progi?', condition: 'i < progi' },
        { id: 'parzysty', type: 'condition', label: 'Próg parzysty?', condition: 'i % 2 === 0' },
        { id: 'plus', type: 'compute', label: 'Rabat +2%', assign: { rabat: 'rabat + 0.02', i: 'i + 1' } },
        { id: 'bonusKrok', type: 'compute', label: 'Bonus +prog', assign: { bonus: 'bonus + prog * 0.1', i: 'i + 1' } },
        { id: 'final', type: 'compute', label: 'Cena końcowa', assign: { cenaKoncowa: 'round(cena * (1 - rabat) - bonus)' } },
        { id: 'out', type: 'output', label: 'Wynik', fields: ['rabat', 'bonus', 'cenaKoncowa'] },
      ],
      edges: [
        { from: 'in', to: 'init' },
        { from: 'init', to: 'loop' },
        { from: 'loop', to: 'parzysty', branch: 'true' },
        { from: 'parzysty', to: 'plus', branch: 'true' },
        { from: 'parzysty', to: 'bonusKrok', branch: 'false' },
        { from: 'plus', to: 'loop' },
        { from: 'bonusKrok', to: 'loop' },
        { from: 'loop', to: 'final', branch: 'false' },
        { from: 'final', to: 'out' },
      ],
    },
  };

  return { credit, discount };
});
