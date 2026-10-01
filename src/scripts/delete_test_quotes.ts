import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = match[2]?.trim() || '';
  }
});

const url = env['VITE_SUPABASE_URL'] || '';
const key = env['VITE_SUPABASE_ANON_KEY'] || '';
const supabase = createClient(url, key);

const TEST_CODES = [
  'CNC 280826',
  'Empresa Teste Alpha 190926',
  'Empresa Teste Beta 190926',
  'INTERATIVA 240826'
];

async function run() {
  console.log('Iniciando deleção definitiva das 4 propostas de teste no Supabase...');

  for (const code of TEST_CODES) {
    const { data: quotes, error: findError } = await supabase
      .from('quotes')
      .select('id, code, client_company')
      .ilike('code', code);

    if (findError) {
      console.error(`Erro ao buscar cotação com código "${code}":`, findError);
      continue;
    }

    if (!quotes || quotes.length === 0) {
      console.log(`Nenhuma cotação encontrada para o código: "${code}"`);
      continue;
    }

    for (const q of quotes) {
      console.log(`Deletando quote_items da proposta ID ${q.id} (Código: "${q.code}")...`);
      const { error: itemsErr } = await supabase
        .from('quote_items')
        .delete()
        .eq('quote_id', q.id);

      if (itemsErr) {
        console.error(`Erro ao deletar quote_items para ${q.id}:`, itemsErr);
      }

      console.log(`Deletando proposta ID ${q.id} da tabela quotes...`);
      const { error: quoteErr } = await supabase
        .from('quotes')
        .delete()
        .eq('id', q.id);

      if (quoteErr) {
        console.error(`Erro ao deletar quote ${q.id}:`, quoteErr);
      } else {
        console.log(`✅ Proposta "${q.code}" (${q.client_company}) deletada com sucesso!`);
      }
    }
  }

  // Verificação pós-deleção
  const { count: totalSent } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'draft');

  const { count: totalDraft } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft');

  const { count: totalAll } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true });

  const { data: remainingTests } = await supabase
    .from('quotes')
    .select('id, code, client_company, status')
    .or('code.ilike.%teste%,client_company.ilike.%teste%,code.ilike.%INTERATIVA 240826%,code.ilike.%CNC 280826%');

  console.log('\n--- AUDITORIA FINAL NO SUPABASE ---');
  console.log(`Total Geral de Orçamentos: ${totalAll}`);
  console.log(`Total Enviados: ${totalSent}`);
  console.log(`Total Rascunhos: ${totalDraft}`);
  console.log('Propostas de teste restantes no banco:', remainingTests);
}

run();
