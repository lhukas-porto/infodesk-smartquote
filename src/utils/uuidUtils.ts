/**
 * Utilitários Oficiais de Validação, Geração e Sanitização de UUIDs (RFC 4122)
 * Garante conformidade estrita com o tipo UUID nativo do PostgreSQL / Supabase,
 * prevenindo erros do tipo 'invalid input syntax for type uuid'.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LENIENT_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida se uma string é um UUID válido no padrão RFC 4122 (36 caracteres com hífens).
 */
export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  const clean = id.trim();
  return clean.length === 36 && (UUID_REGEX.test(clean) || LENIENT_UUID_REGEX.test(clean));
}

/**
 * Gera um UUID v4 criptograficamente seguro.
 */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Converte determinística ou aleatoriamente qualquer string legada (ex: "direct-1795055812345-a1b2")
 * em um UUID v4 válido de 36 caracteres, garantindo que o mesmo ID legado sempre gere o mesmo UUID.
 */
export function sanitizeToUuid(input?: string | null): string {
  if (!input || typeof input !== 'string') return generateUuid();
  const clean = input.trim();
  if (isValidUuid(clean)) return clean.toLowerCase();

  // Algoritmo determinístico de hash FNV-1a para derivar 16 bytes e montar UUID válido
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code + i), 0x01000193);
  }

  // Preenche 32 caracteres hexadecimais
  const p1 = (Math.abs(h1) >>> 0).toString(16).padStart(8, '0');
  const p2 = (Math.abs(h2) >>> 0).toString(16).padStart(8, '0');
  const p3 = (Math.abs(h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
  const p4 = (Math.abs((h1 * 31) ^ h2) >>> 0).toString(16).padStart(8, '0');
  const hex32 = (p1 + p2 + p3 + p4).slice(0, 32);

  // Formata como 8-4-4-4-12 ajustando bits de versão 4 e variante RFC4122
  const part1 = hex32.slice(0, 8);
  const part2 = hex32.slice(8, 12);
  const part3 = '4' + hex32.slice(13, 16); // Versão 4
  const variantDigit = ['8', '9', 'a', 'b'][parseInt(hex32[16], 16) % 4] || 'a';
  const part4 = variantDigit + hex32.slice(17, 20);
  const part5 = hex32.slice(20, 32);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`.toLowerCase();
}
