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
 * Recupera o mapa global de CEPs salvos no localStorage
 */
export const getGlobalLocationCeps = (): Record<string, string> => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(GLOBAL_LOCATION_CEPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/**
 * Salva um CEP no cache global de localidades
 */
export const setGlobalLocationCep = (location: string, cep: string): void => {
  if (typeof localStorage === 'undefined' || !location) return;
  try {
    const cleanKey = normalizeLocationKey(location);
    const cityBase = extractCityBaseKey(location);
    const formatted = formatCep(cep);
    if (!formatted) return;

    const current = getGlobalLocationCeps();
    current[cleanKey] = formatted;
    if (cityBase && cityBase !== cleanKey) {
      current[cityBase] = formatted;
    }
    localStorage.setItem(GLOBAL_LOCATION_CEPS_KEY, JSON.stringify(current));
  } catch {
    /* noop */
  }
};

export interface ResolvedLocationCep {
  cep: string | null;
  formatted: string;
  source: 'company' | 'global_cache' | 'dictionary' | 'none';
  locationName: string;
}

/**
 * Resolve o CEP de uma localidade com hierarquia prioritária:
 * 1. Mapeamento específico da empresa cliente vinculada (matchedCompany.locationCeps)
 * 2. Cache global de CEPs já informados pelo usuário anteriormente
 * 3. Dicionário embutido de cidades/capitais brasileiras
 */
export const resolveLocationCep = (
  location: string | null | undefined,
  company?: ClientCompany | null
): ResolvedLocationCep => {
  if (!location || !location.trim()) {
    return { cep: null, formatted: '', source: 'none', locationName: '' };
  }

  const rawLoc = location.trim();
  const key = normalizeLocationKey(rawLoc);
  const cityKey = extractCityBaseKey(rawLoc);

  // 1. Verifica no cadastro da empresa
  if (company && company.locationCeps) {
    const companyCep = company.locationCeps[key] || company.locationCeps[cityKey];
    if (companyCep) {
      const formatted = formatCep(companyCep);
      return { cep: formatted, formatted, source: 'company', locationName: rawLoc };
    }
  }

  // 2. Verifica no cache global
  const globalCache = getGlobalLocationCeps();
  const cachedCep = globalCache[key] || globalCache[cityKey];
  if (cachedCep) {
    const formatted = formatCep(cachedCep);
    return { cep: formatted, formatted, source: 'global_cache', locationName: rawLoc };
  }

  // 3. Verifica no dicionário de capitais e cidades comuns
  const dictCep = BRAZILIAN_CITIES_BASE_CEPS[key] || BRAZILIAN_CITIES_BASE_CEPS[cityKey];
  if (dictCep) {
    const formatted = formatCep(dictCep);
    return { cep: formatted, formatted, source: 'dictionary', locationName: rawLoc };
  }

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
