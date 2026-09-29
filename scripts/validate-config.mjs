// Validates public/program.json and public/rules.json after a manual edit: npm run validate
import { readFileSync } from 'node:fs';
import { validateProgram, validateRules } from '../src/engine/validate.js';

let program;
let rules;
try {
  program = JSON.parse(readFileSync(new URL('../public/program.json', import.meta.url), 'utf8'));
  rules = JSON.parse(readFileSync(new URL('../public/rules.json', import.meta.url), 'utf8'));
} catch (e) {
  console.error(`JSON non valido: ${e.message}`);
  process.exit(1);
}
const errors = [...validateProgram(program).map((e) => `program.json: ${e}`), ...validateRules(rules, program).map((e) => `rules.json: ${e}`)];
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('program.json e rules.json validi');
