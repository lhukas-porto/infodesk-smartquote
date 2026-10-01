import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2] || '').trim();
});

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function restoreQuoteItems() {
  const quoteId = '8a903465-ff12-4b82-8978-f474ae5a5c58';
  console.log('--- RESTAURANDO ITENS DA PROPOSTA UBEC 290926-4 ---');

  const itemsDefinition = [
    {
      item_number: 1,
      name: 'Teclado One Hand Gamer Lehmox LEY-2083 USB RGB',
      quantity: 10,
      unit_price: 69.00,
      total_price: 690.00,
      search_term: 'Lehmox LEY-2083'
    },
    {
      item_number: 2,
      name: 'Fone de ouvido sem fio Xiaomi Redmi Buds 6 Play preto',
      quantity: 5,
      unit_price: 110.00,
      total_price: 550.00,
      search_term: 'Redmi Buds 6 Play'
    },
    {
      item_number: 3,
      name: 'Adaptador Hub USB Voxo alumínio 8 portas RJ45 HDMI Tipo-C',
      quantity: 10,
      unit_price: 68.00,
      total_price: 680.00,
      search_term: 'Voxo'
    },
    {
      item_number: 4,
      name: 'Power Bank ELG PB102BK 10200mAh turbo preto',
      quantity: 5,
      unit_price: 116.00,
      total_price: 580.00,
      search_term: 'PB102BK'
    },
    {
      item_number: 5,
      name: 'Mochila Lenovo B510 Everyday 15.6" preta',
      quantity: 15,
      unit_price: 161.00,
      total_price: 2415.00,
      search_term: 'Lenovo B510'
    },
    {
      item_number: 6,
      name: 'Power Bank Pro 20000mAh ELG PB200BK preto',
      quantity: 10,
      unit_price: 167.00,
      total_price: 1670.00,
      search_term: 'PB200BK'
    },
    {
      item_number: 7,
      name: 'Controle Gamepad GameSir X5 Lite USB-C Android e iPhone 15/16 Hall Effect',
      quantity: 15,
      unit_price: 231.00,
      total_price: 3465.00,
      search_term: 'GameSir X5 Lite'
    },
    {
      item_number: 8,
      name: 'Fone de ouvido Bluetooth Haylou S30 ANC 80 horas preto',
      quantity: 5,
      unit_price: 278.00,
      total_price: 1390.00,
      search_term: 'Haylou S30'
    }
  ];

  const payloadToInsert = [];

  for (const def of itemsDefinition) {
    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .ilike('name', `%${def.search_term}%`)
      .limit(1);

    const catalogProd = prodData && prodData[0] ? prodData[0] : null;

    payloadToInsert.push({
      quote_id: quoteId,
      item_number: def.item_number,
      product_id: catalogProd ? catalogProd.id : null,
      name: catalogProd?.name || def.name,
      description: catalogProd?.description || '',
      raw_search_query: catalogProd?.name || def.name,
      part_number: catalogProd?.part_number || catalogProd?.sku || '',
      ncm: catalogProd?.ncm || '',
      image_url: catalogProd?.image_url || null,
      show_image: true,
      quantity: def.quantity,
      unit: catalogProd?.unit || 'Un.',
      cost_price: Number(catalogProd?.cost_price || 0),
      shipping_cost: 0,
      tax_percent: 9.02,
      markup_percent: 25.5,
      unit_price: def.unit_price,
      total_price: def.total_price,
      source_url: catalogProd?.source_url || null
    });
  }

  // Deleta itens prévios se houvesse algum
  await supabase.from('quote_items').delete().eq('quote_id', quoteId);

  // Insere os 8 itens oficiais
  const { data: inserted, error: insertError } = await supabase
    .from('quote_items')
    .insert(payloadToInsert)
    .select();

  if (insertError) {
    console.error('Erro ao inserir quote_items:', insertError);
  } else {
    console.log(`✅ ${inserted.length} ITENS INSERIDOS COM SUCESSO NO SUPABASE!`);
    inserted.forEach((it: any) => console.log(`   Item ${it.item_number}: ${it.name} | Qtd: ${it.quantity} | Total: R$ ${it.total_price}`));
  }

  // Atualiza updated_at do quote
  await supabase.from('quotes').update({ updated_at: new Date().toISOString() }).eq('id', quoteId);
  console.log('✅ Proposta UBEC 290926-4 atualizada no banco com sucesso!');
}

restoreQuoteItems();
