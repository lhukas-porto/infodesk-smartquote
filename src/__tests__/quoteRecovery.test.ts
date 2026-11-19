import { test, describe } from 'node:test';
import assert from 'node:assert';

// Mock localStorage para testes Node
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.key) {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; }
  } as any;
}

import { 
  scanAndRecoverDeletedQuotes, 
  restoreRecoveredQuote, 
  permanentlyDeleteRecoveredCandidate,
  saveQuoteItemsBackup,
  recordDeletedQuoteCode,
  recordDeletedQuoteId,
  isQuoteDeleted,
  saveQuotes,
  getQuotes
} from '../utils/storage';
import { Quote } from '../types';

describe('Central de Recuperação de Propostas e Rascunhos Apagados', () => {
  test('Deve recuperar itens de proposta excluída a partir do backup infodesk_backup_items_', () => {
    // 1. Simula criação e backup de orçamento para WWF
    const fakeItems = [
      {
        id: 'wwf-it-1',
        itemNumber: 1,
        name: 'GPS Portátil Garmin Montana 700 para Expedição WWF',
        description: 'GPS de alta precisão para expedição em campo',
        quantity: 2,
        unit: 'Un.',
        costPrice: 3200,
        unitPrice: 4200,
        totalPrice: 8400,
        markupPercent: 31.25,
        supplier: 'Garmin Brasil'
      }
    ];

    const fakeQuote: Quote = {
      id: 'quote-wwf-123',
      code: 'SC 009999',
      clientCompany: 'WWF Brasil',
      contactPerson: 'Coordenação de Campo',
      clientEmail: 'compras@wwf.org.br',
      clientPhone: '61 9999-9999',
      subject: 'Proposta Comercial Garmin',
      city: 'Brasília - DF',
      date: '2026-11-19',
      validityDays: '10 dias',
      paymentTerms: '28 DDL',
      deliveryDays: '5 dias',
      globalTaxPercent: 0,
      globalMarkupPercent: 31.25,
      status: 'draft',
      items: fakeItems,
      totalAmount: 8400,
      totalCost: 6400,
      totalProfit: 2000
    } as Quote;

    // Salva o backup dos itens como o sistema faz automaticamente
    saveQuoteItemsBackup(fakeQuote.code, fakeItems);
    saveQuoteItemsBackup(fakeQuote.id, fakeItems);

    // 2. Simula exclusão (tombstone)
    recordDeletedQuoteCode(fakeQuote.code, fakeQuote.id);
    assert.strictEqual(isQuoteDeleted(fakeQuote), true, 'Cotação deve estar marcada como excluída');

    // 3. Executa o scan da central de recuperação buscando por "WWF"
    const recovered = scanAndRecoverDeletedQuotes('WWF');
    assert.ok(recovered.length > 0, 'Deve encontrar pelo menos um candidato recuperado para WWF');
    
    const candidate = recovered.find(c => 
      c.code.includes('009999') || 
      c.clientCompany.includes('WWF') || 
      c.quote.items.some(it => it.name.includes('Garmin'))
    );
    assert.ok(candidate, 'Candidato correspondente ao WWF deve ser localizado');
    assert.strictEqual(candidate.quote.items.length, 1);
    assert.strictEqual(candidate.quote.items[0].name, 'GPS Portátil Garmin Montana 700 para Expedição WWF');

    // 4. Executa a restauração
    const restored = restoreRecoveredQuote(candidate.quote);
    assert.strictEqual(restored.status, 'draft', 'Orçamento restaurado deve voltar como rascunho');
    assert.strictEqual(isQuoteDeleted(restored), false, 'Cotação restaurada deve ser desmarcada do tombstone');

    // 5. Verifica se reaparece na lista de propostas
    const allQuotes = getQuotes();
    const foundInList = allQuotes.some(q => q.code === restored.code || q.id === restored.id);
    assert.ok(foundInList, 'Orçamento restaurado deve estar presente em getQuotes()');
  });

  test('Deve excluir permanentemente candidato da lixeira (banco e armazenamento local)', async () => {
    const fakeQuote: Quote = {
      id: 'quote-to-purge-999',
      code: 'SC 008888',
      clientCompany: 'Empresa Para Excluir de Vez',
      contactPerson: 'Fiscal de Teste',
      date: '2026-11-19',
      status: 'draft',
      items: [
        {
          id: 'item-purge-1',
          itemNumber: 1,
          name: 'Item Temporário Teste Purge',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }
      ],
      totalAmount: 100
    } as Quote;

    saveQuoteItemsBackup(fakeQuote.code, fakeQuote.items);
    saveQuoteItemsBackup(fakeQuote.id, fakeQuote.items);

    const candidatesBefore = scanAndRecoverDeletedQuotes('Purge');
    const target = candidatesBefore.find(c => c.code.includes('008888') || c.clientCompany.includes('Para Excluir'));
    assert.ok(target, 'Candidato deve existir na lixeira antes de excluir');

    await permanentlyDeleteRecoveredCandidate(target);

    const candidatesAfter = scanAndRecoverDeletedQuotes('Purge');
    const stillExists = candidatesAfter.some(c => c.code.includes('008888') || c.id === target.id);
    assert.strictEqual(stillExists, false, 'Candidato não deve mais existir na lixeira após exclusão permanente');
  });
});
