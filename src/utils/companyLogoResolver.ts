import { ClientCompany } from '../types';

export const extractCleanDomain = (input: string): string => {
  if (!input) return '';
  let clean = input.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//i, '');
  clean = clean.split('/')[0].split('?')[0].split('#')[0].trim();
  clean = clean.replace(/^www\./i, '');
  return clean;
};

export const getCompanyInitials = (name: string): string => {
  const clean = name.replace(/^(ao|à|a|para)\s+/i, '').trim();
  if (clean.length <= 4 && !clean.includes(' ')) return clean.toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
};

export const getAvatarColor = (name: string): string => {
  const colors = [
    'bg-sky-100 text-sky-800 border-sky-200',
    'bg-emerald-100 text-emerald-800 border-emerald-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
    'bg-amber-100 text-amber-800 border-amber-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-rose-100 text-rose-800 border-rose-200',
    'bg-teal-100 text-teal-800 border-teal-200'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export const KNOWN_COMPANY_DOMAINS: Record<string, string> = {
  ubec: 'ubec.edu.br',
  sonda: 'sonda.com',
  'grupo sonda': 'sonda.com',
  sabin: 'sabin.com.br',
  ambev: 'ambev.com.br',
  'rede d\'or': 'rededorsaoluiz.com.br',
  rededor: 'rededorsaoluiz.com.br',
  localiza: 'localiza.com',
  boticário: 'boticario.com.br',
  boticario: 'boticario.com.br',
  'o boticário': 'boticario.com.br',
  totvs: 'totvs.com',
  petrobras: 'petrobras.com.br',
  vale: 'vale.com',
  embraer: 'embraer.com',
  caixa: 'caixa.gov.br',
  'banco do brasil': 'bb.com.br',
  bb: 'bb.com.br',
  itau: 'itau.com.br',
  itaú: 'itau.com.br',
  bradesco: 'bradesco.com.br',
  santander: 'santander.com.br',
  magalu: 'magazineluiza.com.br',
  'magazine luiza': 'magazineluiza.com.br',
  'mercado livre': 'mercadolivre.com.br',
  unimed: 'unimed.coop.br',
  hapvida: 'hapvida.com.br',
  fleury: 'fleury.com.br',
  dasa: 'dasa.com.br',
  einstein: 'einstein.br',
  'sirio libanes': 'hospitalsiriolibanes.org.br',
  'sírio-libanês': 'hospitalsiriolibanes.org.br',
  tjdft: 'tjdft.jus.br',
  senado: 'senado.leg.br',
  camara: 'camara.leg.br',
  câmara: 'camara.leg.br',
  stf: 'stf.jus.br',
  stj: 'stj.jus.br',
  tcu: 'tcu.gov.br',
  gdf: 'df.gov.br',
  'governo de brasília': 'df.gov.br',
  anvisa: 'anvisa.gov.br',
  anatel: 'anatel.gov.br',
  correios: 'correios.com.br',
  serpro: 'serpro.gov.br',
  dataprev: 'dataprev.gov.br',
  telebras: 'telebras.com.br',
  infraero: 'infraero.gov.br',
  sebrae: 'sebrae.com.br',
  senai: 'portaldaindustria.com.br',
  sesi: 'portaldaindustria.com.br',
  sesc: 'sesc.com.br',
  senac: 'senac.br',
  fiocruz: 'fiocruz.br',
  embrapa: 'embrapa.br',
  bsb: 'bsb.aero',
  'bsb.aero': 'bsb.aero',
  inframerica: 'bsb.aero',
  'inframérica': 'bsb.aero',
  'aeroporto de brasilia': 'bsb.aero',
  'aeroporto de brasília': 'bsb.aero',
  cnc: 'cnc.org.br',
  'portaldocomercio.org.br': 'cnc.org.br',
  'portaldocomercio': 'cnc.org.br',
  'confederação nacional do comércio': 'cnc.org.br',
  'confederacao nacional do comercio': 'cnc.org.br',
  micromed: 'micromed.health',
  'micromed.health': 'micromed.health',
  geap: 'www.geap.org.br',
  'geap saude': 'www.geap.org.br',
  'geap saúde': 'www.geap.org.br',
  'geap autogestao': 'www.geap.org.br',
  'geap autogestão': 'www.geap.org.br',
  'geap autogestao em saude': 'www.geap.org.br',
  'geap autogestão em saúde': 'www.geap.org.br',
  'geap.org.br': 'www.geap.org.br',
  'geap.com.br': 'www.geap.org.br'
};

export const KNOWN_COMPANY_DIRECT_LOGOS: Record<string, string> = {
  'bsb.aero': 'https://www.bsb.aero/apple-touch-icon.png',
  inframerica: 'https://www.bsb.aero/apple-touch-icon.png',
  'inframérica': 'https://www.bsb.aero/apple-touch-icon.png',
  'aeroporto de brasilia': 'https://www.bsb.aero/apple-touch-icon.png',
  'aeroporto de brasília': 'https://www.bsb.aero/apple-touch-icon.png',
  'micromed.health': 'https://micromed.health/wp-content/uploads/2024/04/cropped-favicon-180x180.png',
  micromed: 'https://micromed.health/wp-content/uploads/2024/04/cropped-favicon-180x180.png',
  'cnc.org.br': 'https://portal-bucket.azureedge.net/wp-content/2024/02/cropped-favicon_cnc_512px-180x180.png',
  'portaldocomercio.org.br': 'https://portal-bucket.azureedge.net/wp-content/2024/02/cropped-favicon_cnc_512px-180x180.png',
  cnc: 'https://portal-bucket.azureedge.net/wp-content/2024/02/cropped-favicon_cnc_512px-180x180.png',
  'geap.org.br': 'https://icons.duckduckgo.com/ip2/www.geap.org.br.ico',
  'www.geap.org.br': 'https://icons.duckduckgo.com/ip2/www.geap.org.br.ico',
  'geap.com.br': 'https://icons.duckduckgo.com/ip2/www.geap.org.br.ico',
  geap: 'https://icons.duckduckgo.com/ip2/www.geap.org.br.ico'
};

export const getCandidateLogosForDomain = (domain: string): string[] => {
  const clean = extractCleanDomain(domain);
  if (!clean || !clean.includes('.')) return [];

  const list: string[] = [];

  // 0. Mapeamentos diretos conhecidos (alta resolução personalizada)
  if (KNOWN_COMPANY_DIRECT_LOGOS[clean]) {
    list.push(KNOWN_COMPANY_DIRECT_LOGOS[clean]);
  }
  if (KNOWN_COMPANY_DIRECT_LOGOS[`www.${clean}`]) {
    list.push(KNOWN_COMPANY_DIRECT_LOGOS[`www.${clean}`]);
  }

  // 1. Google Favicon v2 com 'clean' e 'www.clean' (é o motor principal de maior cobertura do sistema)
  list.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${clean}&size=128`);
  list.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://www.${clean}&size=128`);
  list.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${clean}&size=128`);
  list.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.${clean}&size=128`);

  // 2. Unavatar Aggregator (Clearbit + Google + redes)
  list.push(`https://unavatar.io/${clean}`);
  list.push(`https://unavatar.io/www.${clean}`);

  // 3. Google Favicon v1 (fallback clássico universal)
  list.push(`https://www.google.com/s2/favicons?domain=${clean}&sz=128`);
  list.push(`https://www.google.com/s2/favicons?domain=www.${clean}&sz=128`);

  // 4. DuckDuckGo Favicon Service
  list.push(`https://icons.duckduckgo.com/ip2/${clean}.ico`);
  list.push(`https://icons.duckduckgo.com/ip2/www.${clean}.ico`);

  // 5. Ícones nativos da raiz da página (HTTPS)
  list.push(`https://www.${clean}/apple-touch-icon.png`);
  list.push(`https://${clean}/apple-touch-icon.png`);
  list.push(`https://www.${clean}/favicon.ico`);
  list.push(`https://${clean}/favicon.ico`);

  return Array.from(new Set(list));
};

export const resolveCompanyCandidates = (comp: Partial<ClientCompany> & { name?: string; website?: string }): string[] => {
  const candidates: string[] = [];

  const cleanName = (comp.name || '').toLowerCase().trim().replace(/^(ao|à|a|para)\s+/i, '');

  // 0. Mapeamento direto de logos por nome
  for (const [key, logoUrl] of Object.entries(KNOWN_COMPANY_DIRECT_LOGOS)) {
    if (cleanName.includes(key)) {
      candidates.push(logoUrl);
    }
  }

  // 1. Se informou o site da empresa (ex: bsb.aero, ubec.edu.br ou www.empresa.com.br)
  if (comp.website && comp.website.trim()) {
    const domain = extractCleanDomain(comp.website);
    if (domain && domain.includes('.')) {
      candidates.push(...getCandidateLogosForDomain(domain));
      if (KNOWN_COMPANY_DOMAINS[domain]) {
        candidates.push(...getCandidateLogosForDomain(KNOWN_COMPANY_DOMAINS[domain]));
      }
    }
  }

  // 2. Se informou uma URL de logo direta ou digitou domínio
  if (comp.logoUrl && comp.logoUrl.trim()) {
    const trimmed = comp.logoUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      candidates.unshift(trimmed);
    } else if (trimmed.includes('.')) {
      candidates.push(...getCandidateLogosForDomain(trimmed));
    }
  }

  // 3. Dicionário de domínios conhecidos por nome
  for (const [key, domain] of Object.entries(KNOWN_COMPANY_DOMAINS)) {
    if (cleanName.includes(key)) {
      candidates.push(...getCandidateLogosForDomain(domain));
    }
  }

  // 4. Extração de domínio corporativo a partir dos e-mails dos contatos
  if (comp.contacts && comp.contacts.length > 0) {
    const publicDomains = new Set([
      'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 
      'bol.com.br', 'uol.com.br', 'live.com', 'icloud.com'
    ]);
    for (const ct of comp.contacts) {
      if (ct.email && ct.email.includes('@')) {
        const domain = ct.email.split('@')[1]?.toLowerCase().trim();
        if (domain && !publicDomains.has(domain)) {
          candidates.push(...getCandidateLogosForDomain(domain));
        }
      }
    }
  }

  // 5. Fallback inteligente para termos únicos
  const words = cleanName.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].length >= 3) {
    const slug = words[0].replace(/[^a-z0-9]/gi, '');
    candidates.push(...getCandidateLogosForDomain(`${slug}.com.br`));
  }

  return Array.from(new Set(candidates));
};

