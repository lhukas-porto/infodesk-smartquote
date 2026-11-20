import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

function findTestFiles(dir) {
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const full = join(dir, file);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(findTestFiles(full));
    } else if (file.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

const testFiles = findTestFiles('src');
console.log(`\n🧪 Executando suíte completa de testes unitários e de integração (${testFiles.length} arquivos)...`);

let passed = 0;
let failed = 0;
const failures = [];

for (const file of testFiles) {
  const shortName = file.replace(/\\/g, '/');
  const res = spawnSync('npx', ['tsx', file], { shell: true, encoding: 'utf-8', timeout: 30000 });
  if (res.status === 0) {
    passed++;
    console.log(`  ✅ [PASS] ${shortName}`);
  } else {
    failed++;
    const errMsg = (res.stderr || res.stdout || 'Erro desconhecido').trim().slice(-300);
    failures.push({ file: shortName, error: errMsg });
    console.log(`  ❌ [FAIL] ${shortName}\n      -> ${errMsg.split('\n').slice(-2).join(' ')}`);
  }
}

console.log(`\n===========================================`);
console.log(`RESUMO DA EXECUÇÃO DOS TESTES:`);
console.log(`Total: ${testFiles.length}`);
console.log(`Aprovados: ${passed}`);
console.log(`Reprovados: ${failed}`);
console.log(`Taxa de Sucesso: ${((passed / testFiles.length) * 100).toFixed(1)}%`);
console.log(`===========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
