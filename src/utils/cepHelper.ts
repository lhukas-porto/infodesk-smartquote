import { ClientCompany } from '../types';

const GLOBAL_LOCATION_CEPS_KEY = 'infodesk_location_ceps';

/**
 * Dicionário embutido de CEPs padrão de capitais e cidades comuns dos clientes Infodesk
 */
export const BRAZILIAN_CITIES_BASE_CEPS: Record<string, string> = {
  // Distrito Federal & Entorno
  'brasilia': '70040-010',
  'brasilia - df': '70040-010',
  'taguatinga': '72010-010',
  'aguas claras': '71900-100',
  'ceilandia': '72210-010',
  'guara': '71010-010',
  'samambaia': '72300-500',
  'sobradinho': '73010-100',
  'gama': '72405-100',
  'planaltina': '73310-100',
  'valparaiso de goias': '72870-000',
  'luziania': '72800-000',

  // Destinos frequentes UBEC, Sabin e Clientes Nacionais
  'manaus': '69005-010',
  'sao jose dos campos': '12209-530',
  'campo grande': '79002-001',
  'uberaba': '38010-000',
  'coronel fabriciano': '35170-001',
  'joinville': '89201-000',
  'itabira': '35900-001',
  'rio de janeiro': '20010-010',
  'sao paulo': '01001-000',
  'belo horizonte': '30110-012',
  'salvador': '40020-000',
  'curitiba': '80010-000',
  'porto alegre': '90010-001',
  'goiania': '74003-010',
  'cuiaba': '78005-100',
  'fortaleza': '60025-001',
  'recife': '50010-000',
  'belem': '66010-000',
  'natal': '59010-000',
  'vitoria': '29010-002',
  'florianopolis': '88010-000',
  'joao pessoa': '58010-000',
  'maceio': '57020-000',
  'aracaju': '49010-000',
  'teresina': '64000-020',
  'sao luis': '65010-000',
  'palmas': '77001-002',
  'porto velho': '76801-002',
  'rio branco': '69900-060',
  'macapa': '68900-010',
  'boa vista': '69301-000',
  'campinas': '13010-001',
  'ribeirao preto': '14010-000',
  'sorocaba': '18010-000',
  'santos': '11010-010',
  'londrina': '86010-000',
  'maringa': '87013-000',
  'caxias do sul': '95020-000',
  'juiz de fora': '36010-001',
  'montes claros': '39400-001',
  'ipatinga': '35160-001',
  'anapolis': '75020-010',
  'foz do iguacu': '85851-000'
};

/**
 * Remove acentuações e padroniza a chave da localidade para busca precisa
 */
export const normalizeLocationKey = (loc: string | null | undefined): string => {
  if (!loc) return '';
  return loc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Extrai o nome da cidade removendo o sufixo de estado se houver (ex: "Joinville - SC" -> "joinville")
 */
export const extractCityBaseKey = (loc: string | null | undefined): string => {
  const norm = normalizeLocationKey(loc);
  if (!norm) return '';
  // Remove " - sp", " - mg", " / sc", etc.
  return norm.split(/\s*[-/]\s*[a-z]{2}$/i)[0].trim();
};

/**
 * Formata dígitos em máscara de CEP: XXXXX-XXX
 */
export const formatCep = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

/**
 * Limpa o cache global legado de CEPs para impedir vazamento entre clientes diferentes
 */
export const clearGlobalLocationCepsCache = (): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(GLOBAL_LOCATION_CEPS_KEY);
  } catch {
    /* noop */
  }
};

// Executa limpeza preventiva do cache compartilhado
clearGlobalLocationCepsCache();

/**
 * Recupera o mapa global de CEPs (mantido apenas para retrocompatibilidade de leitura vazia)
 */
export const getGlobalLocationCeps = (): Record<string, string> => {
  return {};
};

/**
 * Desativado intencionalmente: CEPs pertencem exclusivamente a cada empresa ou à proposta individual
 */
export const setGlobalLocationCep = (_location: string, _cep: string): void => {
  // Blindagem de Isolamento: Não grava mais em escopo global compartilhado
};

export interface ResolvedLocationCep {
  cep: string | null;
  formatted: string;
  source: 'quote' | 'company' | 'dictionary' | 'none';
  locationName: string;
}

/**
 * Resolve o CEP de uma localidade com isolamento estrito por empresa:
 * 1. CEP explícito gravado diretamente na cotação atual (quoteCep)
 * 2. Mapeamento exclusivo no cadastro da empresa cliente vinculada (matchedCompany.locationCeps)
 * 
 * NUNCA consulta cache compartilhado, garantindo que o CEP da UBEC jamais apareça para outros clientes.
 */
export const resolveLocationCep = (
  location: string | null | undefined,
  company?: ClientCompany | null,
  quoteCep?: string | null
): ResolvedLocationCep => {
  const rawLoc = (location || '').trim();

  // 1. Prioridade máxima: CEP definido na própria proposta
  if (quoteCep && quoteCep.trim()) {
    const formatted = formatCep(quoteCep);
    if (formatted) {
      return { cep: formatted, formatted, source: 'quote', locationName: rawLoc };
    }
  }

  if (!rawLoc) {
    return { cep: null, formatted: '', source: 'none', locationName: '' };
  }

  const key = normalizeLocationKey(rawLoc);
  const cityKey = extractCityBaseKey(rawLoc);

  // 2. Mapeamento específico da empresa cliente vinculada
  if (company && company.locationCeps) {
    const companyCep = company.locationCeps[key] || (cityKey ? company.locationCeps[cityKey] : undefined);
    if (companyCep) {
      const formatted = formatCep(companyCep);
      return { cep: formatted, formatted, source: 'company', locationName: rawLoc };
    }
  }

  // Isolamento estrito: Se a empresa não possui este CEP, não assume de outras empresas
  return { cep: null, formatted: '', source: 'none', locationName: rawLoc };
};

/**
 * Busca online via serviço público ViaCEP caso a cidade não tenha CEP pré-cadastrado
 */
export const fetchCepFromViaCep = async (cityName: string): Promise<string | null> => {
  try {
    const cleanCity = cityName.trim();
    if (!cleanCity) return null;

    // Detecta UF se presente no padrão "Cidade - UF" ou "Cidade/UF"
    const ufMatch = cleanCity.match(/[-/]\s*([a-zA-Z]{2})$/);
    const uf = ufMatch ? ufMatch[1].toUpperCase() : '';
    const pureCity = cleanCity.replace(/[-/]\s*[a-zA-Z]{2}$/, '').trim();

    if (!uf || !pureCity) {
      return null;
    }

    // Chamada à API pública do ViaCEP para busca por UF + Município
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(pureCity)}/Centro/json/`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;

    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0 && data[0].cep) {
      return formatCep(data[0].cep);
    }
  } catch {
    /* falha silenciosa no fetch público */
  }
  return null;
};
