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
const canFrame = '+RESP:GTERI,740C08,123456789012345,GV350CEU,00000004,13840,50,1,1,1,0.0,208,493.9,-73.170479,-15.982227,20261106155659,,,,,01,12,80378.0,0000106:06:34,,,,100,220100,0,1,20007FFF,1HGCM82633A004352,2,H803780,214.83,742,5,62,,L14.00,880,0,101.98,64.68,37.30,29.69,00000000,20261106155659,6D1E$';
const canResult = decodeOne(canFrame, { model: MODELS.find(m => m.id === 'gv350ceu') });
const canFields = canResult.sections.flatMap(section => section.fields);
const canField = name => canFields.find(field => field.name === name);
let canChecks = 0, canFailures = 0;
for (const [name, value, human] of [
  ['VIN', '1HGCM82633A004352', ''],
  ['Estado del bus CAN', '1', ''],
  ['Estado de ignición CAN', '2', ''],
  ['Distancia total CAN', 'H803780', '80.378,0 km'],
  ['Combustible total usado CAN', '214.83', '214.83 L'],
  ['RPM del motor CAN', '742', ''],
  ['Velocidad del vehículo CAN', '5', ''],
  ['Temperatura del refrigerante CAN', '62', ''],
  ['Nivel de combustible CAN', 'L14.00', '14.00 L'],
  ['Autonomía CAN', '880', '88.0 km'],
  ['Máscara de expansión CAN', '00000000', ''],
]) {
  canChecks++;
  const field = canField(name);
  if (!field || field.value !== value || (human && field.human !== human)) {
    canFailures++;
    console.log(`✗ CAN ${name}: esperado ${value}${human ? ` (${human})` : ''}, recibido ${field ? `${field.value}${field.human ? ` (${field.human})` : ''}` : 'ausente'}`);
  }
}
if (canResult.data.mileage !== '80378.0' || canResult.positions[0].lon !== '-73.170479'
  || canResult.positions[0].lat !== '-15.982227' || canResult.data.sendTime !== '20261106155659') {
  canFailures++;
  console.log('✗ CAN: la trama dejó desalineados el GNSS, la telemetría o la cola');
}
canChecks++;
if (canResult.warnings.length !== 1 || !canResult.warnings[0].includes('campo adicional antes del bloque GNSS')) {
  canFailures++;
  console.log(`✗ CAN: advertencia inesperada en la trama de prueba (${canResult.warnings.join(' | ')})`);
}
canChecks++;
if (!canFailures) console.log('✓ GV350CEU: verificación de campos CAN');
console.log(`\n${total - failures}/${total} ejemplos sin advertencias`);
console.log(`${canChecks - canFailures}/${canChecks} verificaciones de interpretación CAN`);
process.exit(failures || canFailures ? 1 : 0);
