import { ClientCompany, IncomingEmail } from '../types';
import { 
  extractFullCompanyName, 
  extractDeliveryLocation, 
  extractContactPhone, 
  extractEmailFromText, 
  extractContactPersonFromText,
  isSystemOrNoReplyEmail
} from '../utils/aiEmailParser';

export interface ScannedContactCandidate {
  id: string;
  emailId?: string;
  subject: string;
  date: string;
  companyName: string;
  contactName: string;
  title: 'Sr.' | 'Srta.' | 'Sra.' | 'Dr.' | 'Dra.';
  email: string;
  phone: string;
  deliveryLocation: string;
  role: string;
  snippet?: string;
  selected?: boolean;
}

export interface ScanEmailsParams {
  count: number;
  existingCompanies: ClientCompany[];
  accessToken?: string | null;
  localEmails: IncomingEmail[];
  onProgress?: (percent: number, message: string) => void;
}

/**
 * Normaliza strings para comparação insensível a acentos, pontuação e maiúsculas
 */
function normalizeForComparison(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(ao|à|a|para)\s+/i, '')
    .replace(/^(sr\.|srta\.|sra\.|dr\.|dra\.|a\/c)\s+/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Detecta se o título deve ser Srta. ou Sr. baseado no primeiro nome
 */
function detectTitle(name: string): 'Sr.' | 'Srta.' {
  const clean = name.replace(/^(sr\.|srta\.|sra\.|dr\.|dra\.|a\/c)\s+/i, '').trim();
  const first = clean.split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const femaleNames = new Set([
    'alexandra', 'gabriela', 'maria', 'ana', 'patricia', 'camila', 'juliana',
    'bruna', 'mariana', 'fernanda', 'beatriz', 'carolina', 'aline', 'amanda', 'larissa',
    'leticia', 'jessica', 'daniela', 'vanessa', 'renata', 'luana',
    'bianca', 'roberta', 'claudia', 'monica', 'paula', 'carla',
    'simone', 'luciana', 'andreia', 'viviane', 'cristina', 'helena', 'marina',
    'debora', 'priscila', 'sabrina', 'tamires', 'flavia', 'tatiane',
    'adriana', 'regina', 'solange', 'teresa', 'tereza', 'valeria', 'eliane',
    'isabela', 'isabella', 'clara', 'laura', 'sophia', 'sofia', 'livia', 'luiza',
    'lorena', 'alice', 'sarah', 'sara', 'yasmin', 'raquel', 'fatima', 'elisangela'
  ]);

  const maleExceptions = new Set(['lucas', 'luca', 'joshua', 'elias', 'isaia', 'matias', 'alex', 'alessandro']);
  const isFemale = femaleNames.has(first) || (first.endsWith('a') && !maleExceptions.has(first));
  return isFemale ? 'Srta.' : 'Sr.';
}

/**
 * Executa a varredura minuciosa nos últimos "X" e-mails:
 * 1. Busca mensagens via Gmail API (se conectado) ou nos e-mails capturados/locais
 * 2. Extrai dados de contato, empresa, e-mail, telefone e entrega
 * 3. Aplica FILTRAGEM RIGOROSA prévia para omitir qualquer dado que já conste na Agenda
 * 4. Deduplica os resultados encontrados no próprio lote
 */
export async function scanEmailsForNewClients({
  count,
  existingCompanies,
  accessToken,
  localEmails,
  onProgress
}: ScanEmailsParams): Promise<ScannedContactCandidate[]> {
  onProgress?.(5, `Preparando varredura dos últimos ${count} e-mails...`);

  // Construir índices de verificação rápida para descartar contatos já cadastrados
  const registeredEmails = new Set<string>();
  const registeredCompanyNames = new Set<string>();
  const registeredCompanyContactPairs = new Set<string>();

  existingCompanies.forEach(comp => {
    const normComp = normalizeForComparison(comp.name);
    if (normComp) registeredCompanyNames.add(normComp);

    (comp.contacts || []).forEach(ct => {
      if (ct.email) {
        registeredEmails.add(ct.email.toLowerCase().trim());
      }
      const normContact = normalizeForComparison(ct.name);
      if (normContact) {
        registeredCompanyContactPairs.add(`${normComp}|${normContact}`);
      }
    });
  });

  // Lista de e-mails para processar
  interface RawMessageToAnalyze {
    id: string;
    subject: string;
    date: string;
    from: string;
    body: string;
    snippet: string;
  }

  const rawMessages: RawMessageToAnalyze[] = [];

  // Se o Gmail estiver autenticado com token válido, busca mensagens reais da API
  if (accessToken) {
    try {
      onProgress?.(15, `Buscando os últimos ${count} e-mails na sua conta do Gmail...`);
      const query = encodeURIComponent('in:inbox');
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${Math.min(count, 100)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        const list = (data.messages || []).slice(0, count);

        for (let i = 0; i < list.length; i++) {
          const mItem = list[i];
          const pct = Math.round(15 + ((i + 1) / list.length) * 45);
          onProgress?.(pct, `Lendo e-mail ${i + 1} de ${list.length}...`);

          try {
            const mRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${mItem.id}?format=full`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!mRes.ok) continue;
            const mData = await mRes.json();
            const headers = mData.payload?.headers || [];
            const subH = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'Sem assunto';
            const fromH = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
            const dateH = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || new Date().toISOString();

            // Extrair corpo de texto básico
            let bodyText = mData.snippet || '';
            const extractText = (part: any) => {
              if (part.mimeType === 'text/plain' && part.body?.data) {
                try {
                  bodyText += ' ' + atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                } catch {}
              }
              if (part.parts && Array.isArray(part.parts)) {
                part.parts.forEach(extractText);
              }
            };
            if (mData.payload) extractText(mData.payload);

            rawMessages.push({
              id: mItem.id,
              subject: subH,
              date: dateH,
              from: fromH,
              body: bodyText,
              snippet: mData.snippet || ''
            });
          } catch (e) {
            console.warn('Erro ao carregar mensagem individual do Gmail:', e);
          }
        }
      }
    } catch (err) {
      console.warn('Falha ao buscar do Gmail, utilizando e-mails armazenados:', err);
    }
  }

  // Se não tem Gmail ou não retornou mensagens, utiliza a base de e-mails locais/capturados
  if (rawMessages.length === 0 && localEmails && localEmails.length > 0) {
    onProgress?.(30, `Analisando e-mails capturados na caixa de entrada local...`);
    const slice = localEmails.slice(0, count);
    slice.forEach(e => {
      rawMessages.push({
        id: e.id,
        subject: e.subject || 'Cotação / Solicitação',
        date: e.date || new Date().toLocaleDateString('pt-BR'),
        from: `${e.senderName} <${e.senderEmail}>`,
        body: `${e.body || ''} ${e.snippet || ''}`,
        snippet: e.snippet || ''
      });
    });
  }

  onProgress?.(65, 'Minerando empresas, compradores e localidades...');

  const candidatesMap = new Map<string, ScannedContactCandidate>();

  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    const fullContent = `${msg.from} ${msg.subject} ${msg.body}`;

    // 1. Extração de e-mail do comprador
    // IMPORTANTE: Em e-mails de portais (como BaseB, Nimbi, etc.), o remetente msg.from é 'naoresponder@baseb.com.br'.
    // O e-mail real do comprador está no CORPO da mensagem (ex: "Email: sandra.rodrigues@...").
    let detectedEmail = extractEmailFromText(msg.body);
    if (!detectedEmail && !isSystemOrNoReplyEmail(msg.from)) {
      detectedEmail = extractEmailFromText(msg.from);
    }
    if (isSystemOrNoReplyEmail(detectedEmail)) {
      detectedEmail = '';
    }

    // FILTRO 1: Se o e-mail já estiver cadastrado na Agenda, PULA!
    if (detectedEmail && registeredEmails.has(detectedEmail.toLowerCase().trim())) {
      continue;
    }

    // 2. Extração de comprador / contato
    // Prioriza o corpo (ex: "Contato: Sandra Costa"), evitando capturar o remetente automático do portal
    let detectedName = extractContactPersonFromText(msg.body);
    if (!detectedName && !isSystemOrNoReplyEmail(msg.from)) {
      detectedName = extractContactPersonFromText(msg.from);
    }
    
    // Se o remetente for "Nome da Pessoa <email@...>", limpa o nome (caso não seja portal)
    if (!detectedName && msg.from.includes('<') && !isSystemOrNoReplyEmail(msg.from)) {
      const match = msg.from.match(/^([^<]+)<([^>]+)>/);
      if (match) {
        const potentialName = match[1].replace(/["']/g, '').trim();
        if (potentialName.length >= 3 && !/^(compras|suprimentos|contato|atendimento|sac|vendas|financeiro|nao responder|portal)$/i.test(potentialName)) {
          detectedName = potentialName;
        }
      }
    }

    // 3. Extração de empresa
    // Passa remetente, e-mail, assunto e corpo para busca institucional e de domínio
    let detectedCompany = extractFullCompanyName(msg.from, detectedEmail, msg.subject, msg.body);
    if (!detectedCompany && detectedEmail) {
      const domain = detectedEmail.split('@')[1];
      if (domain && !domain.includes('gmail') && !domain.includes('hotmail') && !domain.includes('yahoo') && !domain.includes('outlook')) {
        const domainClean = domain.split('.')[0];
        detectedCompany = domainClean.charAt(0).toUpperCase() + domainClean.slice(1);
      }
    }

    // 4. Extração de telefone
    const detectedPhone = extractContactPhone(fullContent) || '';

    // 5. Extração de local de entrega
    const detectedLocation = extractDeliveryLocation(msg.body, fullContent) || 'Brasília';

    // Se não encontrou nem contato nem empresa nem e-mail com sentido, descarta
    if (!detectedCompany && !detectedName && !detectedEmail) {
      continue;
    }

    // FILTRO 2: Se a empresa e o comprador já estiverem cadastrados juntos, PULA!
    const normComp = normalizeForComparison(detectedCompany);
    const normContact = normalizeForComparison(detectedName);
    if (normComp && normContact && registeredCompanyContactPairs.has(`${normComp}|${normContact}`)) {
      continue;
    }

    // FILTRO 3: Se o comprador já está cadastrado em outra empresa pelo mesmo e-mail, PULA!
    if (detectedEmail && registeredEmails.has(detectedEmail.toLowerCase().trim())) {
      continue;
    }

    const title = detectedName ? detectTitle(detectedName) : 'Sr.';
    const cleanName = detectedName ? detectedName.replace(/^(sr\.|srta\.|sra\.|dr\.|dra\.|a\/c)\s+/i, '').trim() : '';
    const cleanComp = detectedCompany ? detectedCompany.replace(/^(ao|à|a|para)\s+/i, '').trim() : '';

    // Chave de deduplicação para consolidar repetições do mesmo remetente no mesmo lote
    const dedupKey = detectedEmail 
      ? detectedEmail.toLowerCase() 
      : `${normComp}|${normContact}`;

    const existingCandidate = candidatesMap.get(dedupKey);

    if (existingCandidate) {
      // Mescla com dados mais completos se este e-mail tiver telefone ou local
      if (!existingCandidate.phone && detectedPhone) existingCandidate.phone = detectedPhone;
      if (!existingCandidate.deliveryLocation && detectedLocation) existingCandidate.deliveryLocation = detectedLocation;
      if (!existingCandidate.contactName && cleanName) {
        existingCandidate.contactName = cleanName;
        existingCandidate.title = title;
      }
      if (!existingCandidate.companyName && cleanComp) existingCandidate.companyName = cleanComp;
    } else {
      candidatesMap.set(dedupKey, {
        id: `scanned-${Date.now()}-${i}`,
        emailId: msg.id,
        subject: msg.subject,
        date: msg.date,
        companyName: cleanComp,
        contactName: cleanName,
        title,
        email: detectedEmail,
        phone: detectedPhone,
        deliveryLocation: detectedLocation,
        role: 'Comprador',
        snippet: msg.snippet,
        selected: true
      });
    }
  }

  onProgress?.(100, 'Varredura finalizada com sucesso!');

  return Array.from(candidatesMap.values());
}
