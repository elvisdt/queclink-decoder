// Decodifica todos los ejemplos de cada modelo y falla si alguno tiene
// campos faltantes/sobrantes o errores. Uso: node test/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
const files = ['assets/core.js', ...fs.readdirSync(path.join(root, 'models')).filter(f => f.endsWith('.js')).map(f => 'models/' + f)];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

const { decodeOne, MODELS } = vm.runInContext('({ decodeOne, MODELS })', ctx);
let failures = 0, total = 0;
for (const model of MODELS) {
  for (const [, items] of model.examples) {
    for (const [label, raw] of items) {
      total++;
      const r = decodeOne(raw, { model });
      const problems = [];
      if (r.error) problems.push(r.error);
      problems.push(...r.warnings);
      if (r.model !== model) problems.push(`detectado como ${r.model.name}`);
      if (problems.length) { failures++; console.log(`✗ ${model.name} ${label}: ${problems.join(' | ')}`); }
    }
  }
  console.log(`✓ ${model.name}: ${model.examples.reduce((a, [, i]) => a + i.length, 0)} ejemplos`);
}
console.log(`\n${total - failures}/${total} ejemplos sin advertencias`);
process.exit(failures ? 1 : 0);
