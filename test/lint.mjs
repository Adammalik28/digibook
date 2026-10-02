// Rough undefined-identifier check (no eslint available offline).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const NM = process.env.NM || fileURLToPath(new URL('../node_modules/', import.meta.url));
const require = createRequire(NM.endsWith('/') ? NM : NM + '/');
const acorn = require('acorn');
const walk = require('acorn-walk');
const src = fs.readFileSync(new URL('../out/app.js', import.meta.url), 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
const declared = new Set();
const addPattern = (p) => {
  if (!p) return;
  if (p.type === 'Identifier') declared.add(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach((q) => addPattern(q.type === 'RestElement' ? q.argument : q.value));
  else if (p.type === 'ArrayPattern') p.elements.forEach(addPattern);
  else if (p.type === 'AssignmentPattern') addPattern(p.left);
  else if (p.type === 'RestElement') addPattern(p.argument);
};
walk.full(ast, (n) => {
  if (n.type === 'VariableDeclarator') addPattern(n.id);
  if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ClassDeclaration' || n.type === 'ClassExpression') && n.id) declared.add(n.id.name);
  if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') n.params.forEach(addPattern);
  if (n.type === 'CatchClause' && n.param) addPattern(n.param);
});
const globals = new Set(('window document navigator console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame performance ' +
  'Promise Map Set WeakMap Object Array String Number Boolean Math Date JSON RegExp Error TypeError Symbol Intl URL Blob File FileReader TextDecoder TextEncoder ' +
  'Uint8Array ArrayBuffer DOMParser NodeFilter Node Image IntersectionObserver MutationObserver AbortController Event matchMedia getComputedStyle getSelection ' +
  'localStorage indexedDB atob btoa fetch history location innerWidth innerHeight devicePixelRatio addEventListener removeEventListener visualViewport ' +
  'SpeechSynthesisUtterance speechSynthesis createImageBitmap XMLHttpRequest isFinite isNaN parseInt parseFloat undefined NaN Infinity encodeURIComponent decodeURIComponent ' +
  'structuredClone queueMicrotask HTMLElement CSS globalThis arguments OffscreenCanvas screen').split(/\s+/));
const missing = new Map();
walk.ancestor(ast, {
  Identifier(n, ancestors) {
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return;
    if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
    if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.key === n && !parent.computed) {
      if (parent.type !== 'Property' || !parent.shorthand) return;
    }
    if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return;
    if (declared.has(n.name) || globals.has(n.name)) return;
    if (!missing.has(n.name)) missing.set(n.name, n.loc.start.line);
  },
});
if (missing.size) { console.log('UNDECLARED:'); for (const [k, v] of missing) console.log('  ' + k + ' (line ' + v + ')'); process.exit(1); }
console.log('no undeclared identifiers');
