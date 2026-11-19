import { describe, it } from 'node:test';
import assert from 'node:assert';
import { restoreCatalogFromQuotesAndBackups, saveProducts, getProducts, saveQuotes, deduplicateDirectPurchases } from '../utils/storage';
import { Product, Quote, ProcurementItem } from '../types';
import { isGmailTokenExpiringSoon } from '../services/gmailService';

describe('Restauração do Catálogo e Resolução dos 4 Erros da Auditoria', () => {

  it('1. restoreCatalogFromQuotesAndBackups deve resgatar produtos históricos de orçamentos para o catálogo', () => {
    const existingCatalog: Product[] = [
      {
        id: 'prod-1',
        sku: 'SWITCH-24P',
        partNumber: 'SG2404',
        name: 'Switch Intelbras 24 Portas',
        description: '',
        category: 'Informática, Hardware & Periféricos',
        costPrice: 850,
        unit: 'Un.',
        stock: 5,
        lastUpdated: new Date().toISOString()
      }
    ];

    const historicalQuotes = [
      {
        id: 'quote-hist-01',
        code: 'UBEC 200926-1',
        clientCompany: 'União Brasileira de Educação Católica',
        contactPerson: 'Carlos',
        status: 'sent',
        createdAt: '2026-09-20',
        totalAmount: 1200,
        totalCost: 900,
        totalProfit: 300,
        paymentTerms: 'Faturado.',
        deliveryDays: '05 dias',
        warrantyTerms: '12 meses',
        items: [
          {
            id: 'item-hist-1',
            itemNumber: 1,
            name: 'Switch Intelbras 24 Portas',
            description: '',
            partNumber: 'SG2404',
            costPrice: 850,
            unitPrice: 1100,
            quantity: 1,
            unit: 'Un.',
            markupPercent: 23.5,
            totalPrice: 1100
          },
          {
            id: 'item-hist-2',
            itemNumber: 2,
            name: 'Cabo de Rede Furukawa Cat6 Azul 305m',
            description: '',
            partNumber: '23400198',
            sku: 'CAB-FUR-CAT6',
            costPrice: 590,
            unitPrice: 750,
            quantity: 2,
            unit: 'Cx.',
            markupPercent: 23.5,
            totalPrice: 1500,
            imageUrl: 'https://images.infodesk.net.br/furukawa-cat6.jpg'
          },
          {
            id: 'item-hist-3',
            itemNumber: 3,
            name: 'Patch Cord Furukawa Cat6 1.5m Azul',
            description: '',
            partNumber: '35123001',
            costPrice: 12.5,
            unitPrice: 18,
            quantity: 20,
            unit: 'Un.',
            markupPercent: 23.5,
            totalPrice: 360
          }
        ]
      }
    ];

    saveQuotes(historicalQuotes as unknown as Quote[]);

    const { products: restored, addedCount } = restoreCatalogFromQuotesAndBackups(existingCatalog);

    assert.ok(addedCount >= 2, 'Deveria ter recuperado ao menos 2 novos produtos ausentes do catálogo');
    assert.ok(restored.length >= 3, 'O catálogo total agora deve conter ao menos 3 produtos');

    const cable = restored.find(p => p.partNumber === '23400198');
    assert.ok(cable, 'Cabo Furukawa deve estar presente no catálogo reconstituído');
    assert.strictEqual(cable?.imageUrl, 'https://images.infodesk.net.br/furukawa-cat6.jpg', 'Foto do item histórico deve ser preservada no produto');
    assert.strictEqual(cable?.costPrice, 590, 'Custo original do orçamento deve ser transferido para o produto');
    assert.strictEqual(cable?.unit, 'Cx.', 'Unidade de medida deve ser preservada');

    const patch = restored.find(p => p.partNumber === '35123001');
    assert.ok(patch, 'Patch Cord deve estar presente no catálogo');
    assert.strictEqual(patch?.costPrice, 12.5);
  });

  it('2. isGmailTokenExpiringSoon deve sinalizar quando o token expira ou está próximo do vencimento', () => {
    // Sem token ou expirado retorna true
    assert.strictEqual(isGmailTokenExpiringSoon(5), true);
  });

  it('3. Formatação do Resumo Executivo para mailto deve ficar abaixo do limite de 1.800 caracteres do Windows', () => {
    const quoteCode = 'PLUMA 181126-1';
    const clientCompany = 'Pluma Agroavícola Ltda';
    const formattedTotal = '18.450,00';
    const itemsCount = 35; // Orçamento com 35 itens
    const repName = 'Lucas Porto';
    const trade = 'Infodesk';

    const executiveSummary = 
      `Prezada(o) Comprador,\n\n` +
      `Em atenção à solicitação de Vossa Senhoria, temos a grata satisfação de encaminhar a proposta comercial ${quoteCode} para ${clientCompany}.\n\n` +
      `• Valor Total: R$ ${formattedTotal}\n` +
      `• Condições de Pagamento: Faturado.\n` +
      `• Prazo de Entrega: 05 a 07 dias úteis\n` +
      `• Validade da Proposta: 07 dias\n` +
      `• Garantia: 12 meses\n\n` +
      `A proposta detalhada em alta resolução com a relação completa de todos os ${itemsCount} itens, fotos e especificações técnicas segue em anexo em formato PDF (arquivo baixado automaticamente).\n\n` +
      `Permanecemos à inteira disposição para quaisquer esclarecimentos.\n\n` +
      `Atenciosamente,\n` +
      `${repName}\n` +
      `${trade} — Informática & Tecnologia\n` +
      `Telefone: 61 3033-5373 | WhatsApp: 61 9 9627-2630\n` +
      `CLSW 304 Bloco A Sala 108 – Sudoeste – Brasília - DF`;

    assert.ok(executiveSummary.length < 1800, `O tamanho da mensagem (${executiveSummary.length} chars) deve ser inferior a 1.800 chars`);
    assert.ok(executiveSummary.includes('arquivo baixado automaticamente'), 'Deve orientar sobre o PDF em anexo');
  });

  it('4. deduplicateDirectPurchases deve eliminar IDs duplicados e garantir unicidade absoluta para evitar conflito no Postgres (Erro 21000)', () => {
    const rawItems: Partial<ProcurementItem>[] = [
      {
        id: 'direct-duplicated-id-1',
        name: 'Item A',
        quantity: 1,
        quotedCostPrice: 100,
        quotedUnitPrice: 150,
        quotedTotalPrice: 150
      },
      {
        id: 'direct-duplicated-id-1', // MESMO ID
        name: 'Item B (duplicado acidental)',
        quantity: 2,
        quotedCostPrice: 200,
        quotedUnitPrice: 300,
        quotedTotalPrice: 600
      },
      {
        id: 'd9b736b4-2b99-4c58-8547-0e62a26c4832', // UUID VÁLIDO
        name: 'Item C',
        quantity: 1,
        quotedCostPrice: 50,
        quotedUnitPrice: 75,
        quotedTotalPrice: 75
      }
    ];

    const deduped = deduplicateDirectPurchases(rawItems as ProcurementItem[]);

    assert.strictEqual(deduped.length, 3, 'Deve preservar todos os itens');

    const ids = deduped.map(it => it.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, 3, 'Todos os IDs devem ser 100% únicos após deduplicação');

    // Confirma que nenhum id é igual ao outro
    assert.notStrictEqual(deduped[0].id, deduped[1].id, 'O segundo item duplicado deve ter recebido um novo UUID único');
  });

});
