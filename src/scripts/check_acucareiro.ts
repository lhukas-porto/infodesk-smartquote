import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = match[2]?.trim() || '';
});

const url = env['VITE_SUPABASE_URL'] || '';
const key = env['VITE_SUPABASE_ANON_KEY'] || '';
const supabase = createClient(url, key);

async function run() {
  const { data } = await supabase
    .from('products')
    .select('id, name, sku, part_number, cost_price, category')
    .ilike('name', '%a%ucareiro%');

  console.log('Produtos "Açucareiro" no Supabase:', JSON.stringify(data, null, 2));
}

run();
