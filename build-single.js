// Składa src/ w jeden samodzielny plik HTML (do otwarcia z dysku, bez serwera i internetu).
//   node build-single.js  →  dist/silnik-decyzyjny.html
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'src');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

const html = read('index.html')
  .replace(/<link rel="stylesheet" href="([^"?]+)(\?[^"]*)?">/g, (_, f) => `<style>\n${read(f)}</style>`)
  .replace(/<script src="([^"?]+)(\?[^"]*)?"><\/script>/g, (_, f) => `<script>\n${read(f).replace(/<\/script/gi, '<\\/script')}</script>`);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'silnik-decyzyjny.html'), html);
console.log('dist/silnik-decyzyjny.html', Math.round(html.length / 1024) + ' KB');
