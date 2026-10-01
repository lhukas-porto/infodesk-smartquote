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

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function run() {
  const { data: allProducts, error } = await supabase
    .from('products')
    .select('id, name, sku, part_number, cost_price, category');

  if (error) {
    console.error('Erro ao buscar produtos:', error);
    return;
  }

  console.log(`Total de produtos no Supabase: ${allProducts.length}`);

  const matches = allProducts.filter(p => {
    const n = (p.name || '').toLowerCase();
    return n.includes('acucar') || n.includes('açucar') || n.includes('acú') || n.includes('açú') || n.includes('pearl') || n.includes('wolff') || n.includes('cristal');
  });

  console.log('Produtos encontrados relacionados:', JSON.stringify(matches, null, 2));
}

run();
