# Silnik decyzyjny

Silnik decyzyjny oparty na grafie z wizualizacją wykonania: pętle warunkowe, algorytmy przeliczeń
w węzłach oraz dane wejściowe i wyjściowe każdego węzła w każdej iteracji. Czysty JavaScript,
bez zależności i bez budowania.

## Uruchomienie

- Demo: otwórz `src/index.html` w przeglądarce albo uruchom serwer
  `python -m http.server 8766 --bind 127.0.0.1` w katalogu `src` i wejdź na http://127.0.0.1:8766/index.html
- Testy: `npm test`

## Struktura

| Plik | Opis |
|------|------|
| `src/engine.js` | Silnik: wykonuje graf i zapisuje ślad każdego kroku (`DecisionEngine.run`) |
| `src/visualizer.js`, `src/visualizer.css` | Wizualizacja: graf SVG, odtwarzacz kroków, panel wejść/wyjść (`GraphView.create`) |
| `src/examples.js` | Przykładowe grafy: wniosek kredytowy z pętlą spłaty, rabat z warunkiem w pętli |
| `src/index.html` | Strona demonstracyjna z edytorem danych wejściowych (JSON) |
| `tests/engine.test.js` | Testy silnika i układu grafu (`node:test`) |

## Format grafu

```js
{
  start: 'wniosek',                       // opcjonalnie; domyślnie pierwszy węzeł typu input
  nodes: [
    { id: 'wniosek', type: 'input', required: ['kwota'], defaults: { oprocentowanie: 0.1 } },
    { id: 'licz', type: 'compute', assign: { rata: 'kwota / okres' } },   // liczone po kolei
    { id: 'petla', type: 'loop', condition: 'saldo > 0' },               // tak = ciało, nie = wyjście
    { id: 'czy', type: 'condition', condition: 'score >= 40' },
    { id: 'wynik', type: 'output', fields: ['rata', 'score'] },
  ],
  edges: [
    { from: 'wniosek', to: 'licz' },
    { from: 'petla', to: 'licz', branch: 'true' },
    { from: 'petla', to: 'wynik', branch: 'false' },
  ],
}
```

Wyrażenia to kod JS z dostępem do zmiennych kontekstu i funkcji `min, max, abs, round, floor, ceil,
pow, sqrt, log, exp, clamp`. Wykonują się przez `new Function`, więc definicje grafów muszą pochodzić
z zaufanego źródła. Limit kroków (`run(graph, input, { maxSteps })`, domyślnie 1000) przerywa
nieskończone pętle.

## Użycie wizualizacji

```html
<link rel="stylesheet" href="visualizer.css">
<script src="engine.js"></script>
<script src="visualizer.js"></script>
<script>
  const view = GraphView.create(document.getElementById('view'), graph, { startAt: 'first' });
  view.setRun(DecisionEngine.run(graph, input));
</script>
```

Po zmianach w CSS/JS podbij numer `?v=` w `src/index.html`, żeby przeglądarka nie użyła starych plików z pamięci podręcznej.
