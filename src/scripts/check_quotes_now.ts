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

async function checkNow() {
  const { data: testQuotes } = await supabase
    .from('quotes')
    .select('id, code, client_company, status, created_at')
    .or('code.ilike.%teste%,client_company.ilike.%teste%,code.ilike.%INTERATIVA 240826%,code.ilike.%CNC 280826%');

  console.log('Propostas de teste ou mock restantes no Supabase:', testQuotes);
  
  const { count } = await supabase.from('quotes').select('*', { count: 'exact', head: true });
  console.log('Total exato de quotes no Supabase agora:', count);
}

checkNow();
