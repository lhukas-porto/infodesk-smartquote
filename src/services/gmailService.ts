import { IncomingEmail } from '../types';
import { extractItemsFromEmailContent, extractFullCompanyName, extractDeliveryLocation, extractContactPhone } from '../utils/aiEmailParser';
import { INFODESK_LOGO_BASE64, INFODESK_LOGO_MIME, PHONE_ICON_BASE64, PHONE_ICON_MIME, WHATSAPP_ICON_BASE64, WHATSAPP_ICON_MIME } from '../utils/infodeskLogoBase64';

declare global {
  interface Window {
    google?: any;
  }
}

const GMAIL_TOKEN_KEY = 'infodesk_gmail_access_token';
const GMAIL_TOKEN_EXPIRY = 'infodesk_gmail_token_expiry';
const GMAIL_USER_EMAIL = 'infodesk_gmail_user_email';

export const getStoredAccessToken = (): string | null => {
  const token = localStorage.getItem(GMAIL_TOKEN_KEY);
  const expiry = localStorage.getItem(GMAIL_TOKEN_EXPIRY);
  if (!token) return null;
  if (expiry && Date.now() > Number(expiry)) {
    localStorage.removeItem(GMAIL_TOKEN_KEY);
    localStorage.removeItem(GMAIL_TOKEN_EXPIRY);
    return null;
  }
  return token;
};

export const getStoredUserEmail = (): string | null => {
  const email = localStorage.getItem(GMAIL_USER_EMAIL);
  if (email && email.includes('infodesk.com.br')) {
    localStorage.removeItem(GMAIL_USER_EMAIL);
    return 'lucas@infodesk.net.br';
  }
  return email || 'lucas@infodesk.net.br';
};

export const disconnectGmailAccount = () => {
  localStorage.removeItem(GMAIL_TOKEN_KEY);
  localStorage.removeItem(GMAIL_TOKEN_EXPIRY);
  localStorage.removeItem(GMAIL_USER_EMAIL);
};

export const requestGmailAccessToken = async (
  clientId: string,
  forceSelectAccount: boolean = false,
  preferredEmail?: string
): Promise<{ token: string; email: string }> => {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services não foi carregado. Recarregue a página e tente novamente.'));
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Tempo limite de autenticação Google atingido. Se você fechou a janela, clique novamente para tentar.'));
      }
    }, 90000);

    const safeResolve = (val: { token: string; email: string }) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        resolve(val);
      }
    };

    const safeReject = (err: any) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(err instanceof Error ? err : new Error(err?.message || String(err)));
      }
    };

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
        error_callback: (err: any) => {
          console.warn('Google Identity Services error_callback:', err);
          safeReject(new Error(err?.message || err?.type || 'Autenticação Google cancelada ou janela fechada.'));
        },
        callback: async (response: any) => {
          if (response.error) {
            safeReject(new Error(response.error_description || response.error));
            return;
          }

          const accessToken = response.access_token;
          if (!accessToken) {
            safeReject(new Error('Nenhum token de acesso foi retornado pelo Google.'));
            return;
          }

          const expiresIn = response.expires_in || 3600;
          const expiryTime = Date.now() + Number(expiresIn) * 1000;

          localStorage.setItem(GMAIL_TOKEN_KEY, accessToken);
          localStorage.setItem(GMAIL_TOKEN_EXPIRY, String(expiryTime));

          try {
            // Validar perfil e e-mail real da conta selecionada
            const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!profileRes.ok) {
              const errData = await profileRes.json().catch(() => ({}));
              disconnectGmailAccount();
              safeReject(new Error(errData.error?.message || `A conta Google selecionada não tem acesso ao Gmail (${profileRes.status}). Escolha a conta correta.`));
              return;
            }

            const profile = await profileRes.json();
            const userEmail = (profile.emailAddress || '').toLowerCase().trim();
            if (userEmail) {
              localStorage.setItem(GMAIL_USER_EMAIL, userEmail);
            }

            safeResolve({ token: accessToken, email: userEmail || 'lucas@infodesk.net.br' });
          } catch (err: any) {
            console.error('Erro ao consultar perfil da conta Google:', err);
            disconnectGmailAccount();
            safeReject(new Error(`Não foi possível validar a conta Google selecionada: ${err.message}`));
          }
        },
      });

      const targetHint = (preferredEmail || getStoredUserEmail() || 'lucas@infodesk.net.br').trim();
      const requestOptions: any = {};

      if (forceSelectAccount) {
        requestOptions.prompt = 'select_account';
      } else if (targetHint && targetHint.includes('@')) {
        requestOptions.hint = targetHint;
      }

      client.requestAccessToken(requestOptions);
    } catch (err: any) {
      safeReject(err);
    }
  });
};

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return decoded;
  } catch (e) {
    try {
      return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return '';
    }
  }
}

function extractRawHtmlAndText(payload: any): { html: string; text: string } {
  let html = '';
  let text = '';

  if (!payload) return { html: '', text: '' };

  const walk = (part: any) => {
    if (part.mimeType === 'text/html' && part.body?.data) {
      html = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      text = decodeBase64Url(part.body.data);
    }
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  };

  if (payload.body?.data) {
    if (payload.mimeType === 'text/html') {
      html = decodeBase64Url(payload.body.data);
    } else {
      text = decodeBase64Url(payload.body.data);
    }
  }

  if (payload.parts) {
    payload.parts.forEach(walk);
  }

  if (!text && html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    doc.querySelectorAll('tr, p, div, li').forEach(el => el.append('\n'));
    text = doc.body.textContent || '';
  }

  return { html, text };
}

async function resolveInlineImagesAndHtml(msgId: string, payload: any, accessToken: string): Promise<{ html: string; text: string }> {
  let { html, text } = extractRawHtmlAndText(payload);
  if (!html) return { html, text };

  // Find all inline image parts in payload
  const imageParts: { cid: string; mimeType: string; data?: string; attachmentId?: string }[] = [];

  const findImages = (part: any) => {
    if (part.mimeType?.startsWith('image/')) {
      const headers = part.headers || [];
      const cidHeader = headers.find((h: any) => h.name.toLowerCase() === 'content-id');
      let cid = cidHeader ? cidHeader.value.replace(/[<>]/g, '').trim() : '';
      if (!cid && part.filename) {
        cid = part.filename;
      }
      if (cid) {
        imageParts.push({
          cid,
          mimeType: part.mimeType,
          data: part.body?.data,
          attachmentId: part.body?.attachmentId
        });
      }
    }
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(findImages);
    }
  };

  findImages(payload);

  if (imageParts.length === 0) return { html, text };

  // Resolve data URLs for each image
  for (const img of imageParts) {
    let base64Data = '';
    if (img.data) {
      base64Data = img.data.replace(/-/g, '+').replace(/_/g, '/');
    } else if (img.attachmentId) {
      try {
        const attRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${img.attachmentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (attRes.ok) {
          const attJson = await attRes.json();
          if (attJson.data) {
            base64Data = attJson.data.replace(/-/g, '+').replace(/_/g, '/');
          }
        }
      } catch (e) {
        console.error('Error fetching attachment:', e);
      }
    }

    if (base64Data) {
      const dataUrl = `data:${img.mimeType};base64,${base64Data}`;
      const safeCid = img.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cidRegex = new RegExp(`src=["']cid:${safeCid}["']`, 'gi');
      html = html.replace(cidRegex, `src="${dataUrl}"`);
    }
  }

  return { html, text };
}

export type EmailPeriodFilter = '3d' | '7d' | '15d' | '30d' | 'all';

export const fetchRealGmailMessages = async (
  accessToken: string, 
  period: EmailPeriodFilter = '7d'
): Promise<IncomingEmail[]> => {
  let q = 'in:inbox';
  let maxCount = 25;

  if (period === '3d') {
    q = 'in:inbox newer_than:3d';
    maxCount = 25;
  } else if (period === '7d') {
    q = 'in:inbox newer_than:7d';
    maxCount = 35;
  } else if (period === '15d') {
    q = 'in:inbox newer_than:15d';
    maxCount = 50;
  } else if (period === '30d') {
    q = 'in:inbox newer_than:30d';
    maxCount = 75;
  } else {
    q = 'in:inbox';
    maxCount = 30;
  }

  const query = encodeURIComponent(q);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxCount}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    if (res.status === 401) {
      disconnectGmailAccount();
      throw new Error('Sessão do Google expirada. Por favor, conecte novamente.');
    }
    throw new Error(`Erro ao buscar e-mails: ${res.statusText}`);
  }

  const data = await res.json();
  const messageList = data.messages || [];
  const targetList = messageList.slice(0, Math.min(messageList.length, maxCount));
  const detailedMessages: (IncomingEmail | null)[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < targetList.length; i += BATCH_SIZE) {
    const batch = targetList.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (msgItem: any) => {
        try {
          const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgItem.id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!msgRes.ok) return null;
          const msg = await msgRes.json();

          const headers = msg.payload?.headers || [];
          const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
          const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
          const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');

          const fromRaw = fromHeader ? fromHeader.value : 'Cliente Desconhecido';
          const senderNameMatch = fromRaw.match(/^(.*?)(?:<.*?>)?$/);
          let senderName = senderNameMatch ? senderNameMatch[1].replace(/["']/g, '').trim() : fromRaw;
          if (!senderName) senderName = fromRaw;

          const emailMatch = fromRaw.match(/<([^>]+)>/);
          const senderEmail = (emailMatch ? emailMatch[1] : fromRaw).toLowerCase().trim();

          const subject = subjectHeader ? subjectHeader.value : '(Sem Assunto)';
          const dateStr = dateHeader ? new Date(dateHeader.value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Hoje';

          const { html, text } = await resolveInlineImagesAndHtml(msg.id, msg.payload, accessToken);
          const bodyContent = text.trim() || msg.snippet || 'Sem conteúdo de texto.';
          const suggestedItems = extractItemsFromEmailContent(html || text || msg.snippet || '');

          const senderCompany = extractFullCompanyName(fromRaw, senderEmail, subject, bodyContent);
          const deliveryLocation = extractDeliveryLocation(bodyContent, `${msg.snippet || ''} ${senderCompany}`);
          const senderPhone = extractContactPhone(html || text || '');

          const emailObj: IncomingEmail = {
            id: String(msg.id),
            senderName: String(senderName || 'Cliente / Solicitante'),
            senderEmail: String(senderEmail || 'cliente@empresa.com.br'),
            senderCompany: String(senderCompany || 'Empresa / Solicitante'),
            senderPhone: senderPhone ? String(senderPhone) : '',
            deliveryLocation: deliveryLocation ? String(deliveryLocation) : 'Brasília - DF',
            subject: String(subject || '(Sem Assunto)'),
            date: String(dateStr || 'Hoje'),
            snippet: String(msg.snippet || bodyContent.slice(0, 100) || ''),
            body: String(bodyContent || ''),
            bodyHtml: html ? String(html) : undefined,
            unread: Boolean(msg.labelIds?.includes('UNREAD')),
            status: 'new',
            suggestedItems: Array.isArray(suggestedItems) ? suggestedItems : []
          };

          return emailObj;
        } catch (err) {
          return null;
        }
      })
    );
    detailedMessages.push(...batchResults);
  }

  return detailedMessages.filter(Boolean) as IncomingEmail[];
};

// Funções modernas e seguras para codificação UTF-8 Base64 (substituindo unescape legado)
function encodeUtf8Base64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function encodeBase64UrlSafe(str: string): string {
  return encodeUtf8Base64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export const sendRealGmailMessage = async (
  accessToken: string,
  params: {
    to: string;
    cc?: string;
    from: string;
    fromName?: string;
    replyTo?: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
  }
) => {
  const utf8Subject = `=?utf-8?B?${encodeUtf8Base64(params.subject)}?=`;
  
  // Se houver fromName (ex: "Lucas - Infodesk"), codifica no padrão RFC 2047
  let fromHeader = params.from;
  if (params.fromName && params.fromName.trim()) {
    const utf8FromName = `=?utf-8?B?${encodeUtf8Base64(params.fromName.trim())}?=`;
    // Se params.from já vier com <email>, extrai só o email
    const rawEmailMatch = params.from.match(/<([^>]+)>/) || [null, params.from.trim()];
    let cleanEmail = (rawEmailMatch[1] || params.from.trim()).toLowerCase();
    if (cleanEmail === 'me' || cleanEmail.includes('com.br')) {
      const stored = getStoredUserEmail();
      cleanEmail = (stored && !stored.includes('com.br')) ? stored : 'lucas@infodesk.net.br';
    }
    fromHeader = `${utf8FromName} <${cleanEmail}>`;
  }

  const messageParts = [
    `From: ${fromHeader}`,
    `To: ${(params.to || '').toLowerCase().trim()}`,
  ];

  if (params.replyTo && params.replyTo.trim()) {
    messageParts.push(`Reply-To: ${params.replyTo.trim()}`);
  }

  if (params.cc && params.cc.trim()) {
    messageParts.push(`Cc: ${params.cc.toLowerCase().trim()}`);
  }

  messageParts.push(`Subject: ${utf8Subject}`);
  messageParts.push('MIME-Version: 1.0');

  if (params.bodyHtml) {
    // Identifica e extrai imagens inline em Base64 (data:image/...) para convertê-las em CIDs MIME nativos.
    // Isso é indispensável para clientes como Microsoft Outlook Desktop, que bloqueiam tags <img src="data:...">
    const dynamicInlineImages: Array<{ cid: string; mime: string; base64: string; filename: string }> = [];
    let processedHtml = params.bodyHtml;
    let imgCounter = 0;

    processedHtml = processedHtml.replace(
      /src=["'](data:(image\/[a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\s]+))["']/gi,
      (_match, _fullUri, mime, rawBase64) => {
        const cleanBase64 = rawBase64.replace(/\s+/g, '');
        const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const cid = `product-item-img-${imgCounter++}`;
        const filename = `item-preview-${imgCounter}.${ext}`;
        dynamicInlineImages.push({
          cid,
          mime,
          base64: cleanBase64,
          filename
        });
        return `src="cid:${cid}"`;
      }
    );

    const hasInlineLogo = processedHtml.includes('cid:infodesk-logo');
    const hasAnyRelatedAttachments = hasInlineLogo || dynamicInlineImages.length > 0;

    if (hasAnyRelatedAttachments) {
      // Estrutura multipart/related para suportar anexo inline (CID)
      const relatedBoundary = `__related_boundary_${Date.now()}__`;
      const altBoundary = `__alt_boundary_${Date.now()}__`;

      messageParts.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`);
      messageParts.push('');
      
      // Parte 1 do Related: O multipart/alternative (texto puro + HTML)
      messageParts.push(`--${relatedBoundary}`);
      messageParts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      messageParts.push('');
      
      // Texto puro
      messageParts.push(`--${altBoundary}`);
      messageParts.push('Content-Type: text/plain; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: 7bit');
      messageParts.push('');
      messageParts.push(params.bodyText);
      messageParts.push('');

      // HTML da proposta
      messageParts.push(`--${altBoundary}`);
      messageParts.push('Content-Type: text/html; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: 7bit');
      messageParts.push('');
      messageParts.push(processedHtml);
      messageParts.push('');
      messageParts.push(`--${altBoundary}--`);
      messageParts.push('');

      // Parte 2 do Related: Imagem inline da Logo da Infodesk
      if (hasInlineLogo) {
        messageParts.push(`--${relatedBoundary}`);
        messageParts.push(`Content-Type: ${INFODESK_LOGO_MIME}; name="logo-infodesk.png"`);
        messageParts.push('Content-Transfer-Encoding: base64');
        messageParts.push('Content-ID: <infodesk-logo>');
        messageParts.push('Content-Disposition: inline; filename="logo-infodesk.png"');
        messageParts.push('');
        
        // Divide o base64 em linhas de até 76 caracteres conforme padrão MIME
        const logoChunks = INFODESK_LOGO_BASE64.match(/.{1,76}/g) || [INFODESK_LOGO_BASE64];
        messageParts.push(logoChunks.join('\r\n'));
        messageParts.push('');
      }

      // Parte 3 do Related: Ícone oficial do Telefone inline
      if (processedHtml.includes('cid:phone-icon')) {
        messageParts.push(`--${relatedBoundary}`);
        messageParts.push(`Content-Type: ${PHONE_ICON_MIME}; name="phone-icon.png"`);
        messageParts.push('Content-Transfer-Encoding: base64');
        messageParts.push('Content-ID: <phone-icon>');
        messageParts.push('Content-Disposition: inline; filename="phone-icon.png"');
        messageParts.push('');
        
        const phoneChunks = PHONE_ICON_BASE64.match(/.{1,76}/g) || [PHONE_ICON_BASE64];
        messageParts.push(phoneChunks.join('\r\n'));
        messageParts.push('');
      }

      // Parte 4 do Related: Ícone oficial do WhatsApp inline
      if (processedHtml.includes('cid:whatsapp-icon')) {
        messageParts.push(`--${relatedBoundary}`);
        messageParts.push(`Content-Type: ${WHATSAPP_ICON_MIME}; name="whatsapp-icon.png"`);
        messageParts.push('Content-Transfer-Encoding: base64');
        messageParts.push('Content-ID: <whatsapp-icon>');
        messageParts.push('Content-Disposition: inline; filename="whatsapp-icon.png"');
        messageParts.push('');
        
        const waChunks = WHATSAPP_ICON_BASE64.match(/.{1,76}/g) || [WHATSAPP_ICON_BASE64];
        messageParts.push(waChunks.join('\r\n'));
        messageParts.push('');
      }

      // Parte 5 do Related: Imagens dinâmicas de produtos inline
      for (const dynImg of dynamicInlineImages) {
        messageParts.push(`--${relatedBoundary}`);
        messageParts.push(`Content-Type: ${dynImg.mime}; name="${dynImg.filename}"`);
        messageParts.push('Content-Transfer-Encoding: base64');
        messageParts.push(`Content-ID: <${dynImg.cid}>`);
        messageParts.push(`Content-Disposition: inline; filename="${dynImg.filename}"`);
        messageParts.push('');
        
        const dynChunks = dynImg.base64.match(/.{1,76}/g) || [dynImg.base64];
        messageParts.push(dynChunks.join('\r\n'));
        messageParts.push('');
      }

      messageParts.push(`--${relatedBoundary}--`);

    } else {
      // multipart/alternative padrão
      const boundary = `__boundary_${Date.now()}__`;
      messageParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      messageParts.push('');
      messageParts.push(`--${boundary}`);
      messageParts.push('Content-Type: text/plain; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: 7bit');
      messageParts.push('');
      messageParts.push(params.bodyText);
      messageParts.push('');
      messageParts.push(`--${boundary}`);
      messageParts.push('Content-Type: text/html; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: 7bit');
      messageParts.push('');
      messageParts.push(params.bodyHtml);
      messageParts.push('');
      messageParts.push(`--${boundary}--`);
    }
  } else {
    messageParts.push(
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      params.bodyText
    );
  }

  const message = messageParts.join('\r\n');

  const encodedMessage = encodeBase64UrlSafe(message);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Erro ao enviar e-mail (${response.status})`);
  }

  return await response.json();
};
