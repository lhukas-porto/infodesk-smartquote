import { IncomingEmail } from '../types';
import { extractItemsFromEmailContent, extractFullCompanyName, extractDeliveryLocation, extractContactPhone } from '../utils/aiEmailParser';

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
  return localStorage.getItem(GMAIL_USER_EMAIL);
};

export const disconnectGmailAccount = () => {
  localStorage.removeItem(GMAIL_TOKEN_KEY);
  localStorage.removeItem(GMAIL_TOKEN_EXPIRY);
  localStorage.removeItem(GMAIL_USER_EMAIL);
};

export const requestGmailAccessToken = async (clientId: string): Promise<{ token: string; email: string }> => {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services não foi carregado. Recarregue a página e tente novamente.'));
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }

          const accessToken = response.access_token;
          const expiresIn = response.expires_in || 3600;
          const expiryTime = Date.now() + Number(expiresIn) * 1000;

          localStorage.setItem(GMAIL_TOKEN_KEY, accessToken);
          localStorage.setItem(GMAIL_TOKEN_EXPIRY, String(expiryTime));

          try {
            // Fetch User Profile
            const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            const profile = await profileRes.json();
            const userEmail = profile.emailAddress || 'lucas@infodesk.com.br';
            localStorage.setItem(GMAIL_USER_EMAIL, userEmail);

            resolve({ token: accessToken, email: userEmail });
          } catch (err) {
            resolve({ token: accessToken, email: 'lucas@infodesk.com.br' });
          }
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(err);
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

  const detailedMessages = await Promise.all(
    messageList.slice(0, Math.min(messageList.length, maxCount)).map(async (msgItem: any) => {
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

  return detailedMessages.filter(Boolean) as IncomingEmail[];
};

export const sendRealGmailMessage = async (
  accessToken: string,
  params: {
    to: string;
    from: string;
    subject: string;
    bodyText: string;
  }
) => {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=`;
  const messageParts = [
    `From: ${params.from}`,
    `To: ${(params.to || '').toLowerCase().trim()}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.bodyText
  ];
  const message = messageParts.join('\r\n');

  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

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
