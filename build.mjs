// Membangun halaman satu file (index.html) dari src/.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const order = ['00-util', '01-icons', '02-libs', '03-platform', '04-convert', '06-reader', '07-pdf', '08-flow', '09-reader-ui', '10-tts', '05-library', '99-main'];
const js = order.map((n) => `// ==== ${n} ====\n` + fs.readFileSync(path.join(HERE, 'src/js', n + '.js'), 'utf8')).join('\n');
const page = fs.readFileSync(path.join(HERE, 'src/page.html'), 'utf8');
// Halaman berdiri sendiri: tambahkan doctype dan meta, lalu pisahkan <head> dari <body> (setelah </style>).
const cut = page.indexOf('</style>') + '</style>'.length;
const head = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
`;
const out = head + page.slice(0, cut) + `
</head>
<body>` + page.slice(cut) + `
<script>
(() => {
'use strict';
${js}
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(HERE, 'index.html'), out);
fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'out/app.js'), `(() => {\n'use strict';\n${js}\n})();\n`);
console.log('index.html', (out.length / 1024).toFixed(1) + ' KB');
