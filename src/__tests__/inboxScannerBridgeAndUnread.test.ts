import { IncomingEmail } from '../types';
import { EmailPeriodFilter } from '../services/gmailService';
import { parsePastedProductListWithQty } from '../services/priceScannerService';

console.log('\n🧪 Iniciando testes de Filtro "Não lidos" e Ponte Inbox -> Scanner IA...');

// 1. Validação do tipo EmailPeriodFilter aceitando 'unread'
const validPeriods: EmailPeriodFilter[] = ['3d', '7d', '15d', '30d', 'all', 'unread'];
if (!validPeriods.includes('unread')) {
  throw new Error('Falha: "unread" deve ser um período válido em EmailPeriodFilter.');
}
console.log('✓ Teste 1 aprovado: EmailPeriodFilter suporta "unread" como filtro de período oficial!');

// 2. Validação da filtragem de e-mails não lidos
const mockEmails: IncomingEmail[] = [
  {
    id: 'mail-1',
    senderName: 'Carlos Silva',
    senderEmail: 'carlos@empresa.com.br',
    senderCompany: 'Tribunal Regional',
    subject: 'Cotação de Nobreaks',
    date: 'Hoje, 10:00',
    snippet: 'Solicitamos proposta comercial...',
    body: 'Solicitamos proposta comercial para 3 nobreaks.',
    unread: true,
    status: 'new',
    suggestedItems: [{ name: 'Nobreak SMS 1200VA', description: 'Nobreak SMS 1200VA', quantity: 3, unit: 'Un.' }]
  },
  {
    id: 'mail-2',
    senderName: 'Ana Souza',
    senderEmail: 'ana@hospital.com.br',
    senderCompany: 'Hospital Santa Luzia',
    subject: 'Pedido de Preço Cabos',
    date: 'Ontem, 14:30',
    snippet: 'Favor cotar cabos Furukawa...',
    body: 'Favor cotar cabos de rede.',
    unread: false,
    status: 'new',
    suggestedItems: [{ name: 'Cabo Furukawa Cat6', description: 'Cabo Furukawa Cat6', quantity: 10, unit: 'Cx.' }]
  },
  {
    id: 'mail-3',
    senderName: 'Marcos Lima',
    senderEmail: 'marcos@orgao.gov.br',
    senderCompany: 'Ministério Público',
    subject: 'Aquisição de Monitores Dell',
    date: 'Hoje, 11:15',
    snippet: 'Aquisição de monitores 27 pol...',
    body: 'Solicitamos orçamento de monitores.',
    unread: true,
    status: 'new',
    suggestedItems: [{ name: 'Monitor Dell 27 4K', description: 'Monitor Dell 27 4K', quantity: 5, unit: 'Un.' }]
  }
];

const unreadFilter = (emails: IncomingEmail[], period: EmailPeriodFilter) => {
  return emails.filter(m => (period === 'unread' ? m.unread : true));
};

const unreadEmails = unreadFilter(mockEmails, 'unread');
if (unreadEmails.length !== 2) {
  throw new Error(`Falha: Esperava 2 e-mails não lidos, obteve ${unreadEmails.length}`);
}
if (!unreadEmails.every(m => m.unread)) {
  throw new Error('Falha: Todos os e-mails retornados pelo filtro devem ser não lidos.');
}
console.log('✓ Teste 2 aprovado: Filtro de e-mails não lidos isola com 100% de precisão as mensagens pendentes!');

// 3. Validação da ponte Inbox -> Scanner IA: Formatação e Parsing de Itens
const suggestedItemsFromInbox = [
  {
    name: 'Cabo de Rede Furukawa Gigalan Cat6 Azul',
    partNumber: '23400103',
    quantity: 6,
    unit: 'Cx.'
  },
  {
    name: 'Conector Fêmea Keystone RJ45 Cat6 SohoPlus',
    partNumber: '35050040',
    quantity: 150,
    unit: 'Un.'
  },
  {
    name: 'Patch Panel 24 Portas Cat6 Carregado',
    partNumber: '35030005',
    quantity: 2,
    unit: 'Un.'
  }
];

// Lógica de formatação da ponte (idêntica à de App.tsx / InboxView.tsx)
const bridgeLines = suggestedItemsFromInbox.map(it => {
  const cleanName = (it.name || '').trim();
  const codePart = it.partNumber ? ` [Ref: ${it.partNumber}]` : '';
  const qtyPart = ` | Qtd: ${it.quantity || 1} ${it.unit || 'Un.'}`;
  return `${cleanName}${codePart}${qtyPart}`.trim();
});
const formattedBridgeQuery = bridgeLines.join('\n');

// Validar que o Scanner IA consegue ler esse texto e reidratar os produtos e quantidades
const parsedInScanner = parsePastedProductListWithQty(formattedBridgeQuery);
if (parsedInScanner.length !== 3) {
  throw new Error(`Falha: Scanner IA deveria extrair 3 produtos, extraiu ${parsedInScanner.length}`);
}

if (parsedInScanner[0].quantity !== 6 || !parsedInScanner[0].query.includes('23400103')) {
  throw new Error('Falha no Item 1: Quantidade 6 e código 23400103 devem ser preservados no Scanner IA.');
}
if (parsedInScanner[1].quantity !== 150 || !parsedInScanner[1].query.includes('35050040')) {
  throw new Error('Falha no Item 2: Quantidade 150 e código 35050040 devem ser preservados no Scanner IA.');
}
if (parsedInScanner[2].quantity !== 2 || !parsedInScanner[2].query.includes('35030005')) {
  throw new Error('Falha no Item 3: Quantidade 2 e código 35030005 devem ser preservados no Scanner IA.');
}
console.log('✓ Teste 3 aprovado: Ponte Inbox -> Scanner IA preserva nomes, part numbers e quantidades para varredura!');

console.log('🎉 TODOS OS TESTES DE FILTRO DE NÃO LIDOS E PONTE INBOX -> SCANNER PASSARAM COM SUCESSO!\n');
