import React, { useState, useMemo } from 'react';
import { 
  Building, 
  Users, 
  User, 
  Mail, 
  Phone, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Search, 
  Edit3, 
  MapPin, 
  Briefcase, 
  ArrowRightLeft, 
  Sparkles,
  FileText,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowRight,
  PlusCircle,
  Clock,
  Save,
  Globe,
  ExternalLink
} from 'lucide-react';
import { ClientCompany, ClientContact } from '../types';
import { maskPhone } from '../utils/aiEmailParser';

interface ClientManagementViewProps {
  companies: ClientCompany[];
  onSaveCompanies: (companies: ClientCompany[]) => void;
  onDeleteCompany?: (companyId: string) => void;
  onDeleteContact?: (contactId: string, companyId: string) => void;
  onSelectBuyerForQuote?: (companyName: string, contact: ClientContact, location?: string) => void;
}

const extractCleanDomain = (input: string): string => {
  if (!input) return '';
  let clean = input.trim().toLowerCase();
  clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '');
  clean = clean.split('/')[0].split('?')[0].split('#')[0].trim();
  return clean;
};

const getCompanyInitials = (name: string): string => {
  const clean = name.replace(/^(ao|à|a|para)\s+/i, '').trim();
  if (clean.length <= 4 && !clean.includes(' ')) return clean.toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
};

const getAvatarColor = (name: string) => {
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

const KNOWN_COMPANY_DOMAINS: Record<string, string> = {
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
  'micromed.health': 'micromed.health'
};

const KNOWN_COMPANY_DIRECT_LOGOS: Record<string, string> = {
  'bsb.aero': 'https://www.bsb.aero/apple-touch-icon.png',
  inframerica: 'https://www.bsb.aero/apple-touch-icon.png',
  'inframérica': 'https://www.bsb.aero/apple-touch-icon.png',
  'aeroporto de brasilia': 'https://www.bsb.aero/apple-touch-icon.png',
  'aeroporto de brasília': 'https://www.bsb.aero/apple-touch-icon.png',
  'micromed.health': 'https://micromed.health/wp-content/uploads/2024/04/cropped-favicon-180x180.png',
  micromed: 'https://micromed.health/wp-content/uploads/2024/04/cropped-favicon-180x180.png',
  'cnc.org.br': 'https://portal-bucket.azureedge.net/wp-content/2024/02/cropped-favicon_cnc_512px-180x180.png',
  'portaldocomercio.org.br': 'https://portal-bucket.azureedge.net/wp-content/2024/02/cropped-favicon_cnc_512px-180x180.png',
  cnc: 'https://portal-bucket.azureedge.net/wp-content/2024/02/cropped-favicon_cnc_512px-180x180.png'
};

const getCandidateLogosForDomain = (domain: string): string[] => {
  const clean = extractCleanDomain(domain);
  if (!clean || !clean.includes('.')) return [];

  const list: string[] = [];

  // Se tem URL direta mapeada
  if (KNOWN_COMPANY_DIRECT_LOGOS[clean]) {
    list.push(KNOWN_COMPANY_DIRECT_LOGOS[clean]);
  }

  // 1. Google Favicon v2 (scraper moderno que inspeciona o HTML da página e descobre favicons de CMS/WordPress)
  list.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${clean}&size=128`);
  list.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://www.${clean}&size=128`);

  // 2. DuckDuckGo Favicon Service (altamente confiável para portais brasileiros .org.br e .gov.br)
  list.push(`https://icons.duckduckgo.com/ip2/${clean}.ico`);

  // 3. Unavatar Aggregator
  list.push(`https://unavatar.io/${clean}`);

  // 4. Ícones nativos da raiz da página (quando presentes)
  list.push(`https://www.${clean}/apple-touch-icon.png`);
  list.push(`https://${clean}/apple-touch-icon.png`);
  list.push(`https://www.${clean}/favicon-32x32.png`);
  list.push(`https://${clean}/favicon-32x32.png`);
  list.push(`https://www.${clean}/favicon.ico`);
  list.push(`https://${clean}/favicon.ico`);

  // 5. Google Favicon v1 (fallback clássico)
  list.push(`https://www.google.com/s2/favicons?domain=${clean}&sz=128`);
  list.push(`https://www.google.com/s2/favicons?domain=www.${clean}&sz=128`);

  return Array.from(new Set(list));
};

const resolveCompanyCandidates = (comp: Partial<ClientCompany> & { name?: string; website?: string }): string[] => {
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
      // Se o domínio informado tiver um alias oficial (ex: portaldocomercio.org.br -> cnc.org.br)
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

  // 4. Extração de domínio corporativo a partir dos e-mails dos contatos (fundamental para empresas com domínio diferente)
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

const CompanyLogoBadge: React.FC<{
  company: ClientCompany;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ company, size = 'sm', className = '' }) => {
  const candidates = React.useMemo(() => resolveCompanyCandidates(company), [company.id, company.name, company.website, company.logoUrl, company.contacts]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  React.useEffect(() => {
    setCandidateIndex(0);
  }, [company.id, company.name, company.website, company.logoUrl]);

  const initials = getCompanyInitials(company.name);
  const avatarColor = getAvatarColor(company.name);

  const sizeClasses = {
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base'
  }[size];

  const currentSrc = candidates[candidateIndex];

  if (currentSrc && candidateIndex < candidates.length) {
    return (
      <div className={`${sizeClasses} rounded-full border border-slate-200/90 bg-white p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden ${className}`}>
        <img
          key={currentSrc}
          src={currentSrc}
          alt={company.name}
          className="w-full h-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            // Descarta imagens dummy 1x1 ou transparentes que retornam HTTP 200 falso
            if (img.naturalWidth <= 3 || img.naturalHeight <= 3) {
              setCandidateIndex(prev => prev + 1);
            }
          }}
          onError={() => setCandidateIndex(prev => prev + 1)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} rounded-full border flex items-center justify-center font-bold font-mono shrink-0 shadow-2xs ${avatarColor} ${className}`}>
      {initials}
    </div>
  );
};

const WebsiteFaviconPreview: React.FC<{
  website: string;
  className?: string;
}> = ({ website, className = 'w-5 h-5' }) => {
  const domain = extractCleanDomain(website);
  const candidates = React.useMemo(() => getCandidateLogosForDomain(domain), [domain]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  React.useEffect(() => {
    setCandidateIndex(0);
  }, [domain]);

  const currentSrc = candidates[candidateIndex];

  if (!domain || !domain.includes('.') || !currentSrc || candidateIndex >= candidates.length) {
    return null;
  }

  return (
    <div className={`${className} rounded-full border border-slate-200 bg-white p-0.5 shadow-2xs overflow-hidden flex items-center justify-center`} title="Prévia da logo da aba">
      <img
        key={currentSrc}
        src={currentSrc}
        alt="Favicon"
        className="w-full h-full object-contain"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth <= 3 || img.naturalHeight <= 3) {
            setCandidateIndex(prev => prev + 1);
          }
        }}
        onError={() => setCandidateIndex(prev => prev + 1)}
      />
    </div>
  );
};

export const ClientManagementView: React.FC<ClientManagementViewProps> = ({
  companies,
  onSaveCompanies,
  onDeleteCompany,
  onDeleteContact,
  onSelectBuyerForQuote
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => companies[0]?.id || '');
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Deletion confirmation
  const [companyIdToDelete, setCompanyIdToDelete] = useState<string | null>(null);
  const [contactIdToDelete, setContactIdToDelete] = useState<string | null>(null);

  // New Company form state
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyPrefix, setNewCompanyPrefix] = useState<'À' | 'Ao'>('À');
  const [newCompanyLocation, setNewCompanyLocation] = useState('Brasília - DF');
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('');

  // Edit Company state
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyPrefix, setEditCompanyPrefix] = useState<'À' | 'Ao'>('À');
  const [editCompanyLocation, setEditCompanyLocation] = useState('');
  const [editCompanyWebsite, setEditCompanyWebsite] = useState('');

  // New Contact form state
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState<'Sr.' | 'Srta.' | 'Sra.' | 'Dr.' | 'Dra.'>('Sr.');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactCompanyId, setContactCompanyId] = useState<string>('');

  // Edit Contact state
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [editingContactCompanyId, setEditingContactCompanyId] = useState<string>('');
  const [editContactName, setEditContactName] = useState('');
  const [editContactTitle, setEditContactTitle] = useState<'Sr.' | 'Srta.' | 'Sra.' | 'Dr.' | 'Dra.'>('Sr.');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editContactTargetCompanyId, setEditContactTargetCompanyId] = useState<string>('');

  // Location adding
  const [newLocationName, setNewLocationName] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const totalCompanies = companies.length;
  const totalContacts = useMemo(() => companies.reduce((acc, c) => acc + (c.contacts?.length || 0), 0), [companies]);
  const uniqueLocationsCount = useMemo(() => {
    const set = new Set<string>();
    companies.forEach(c => {
      if (c.defaultDeliveryLocation) set.add(c.defaultDeliveryLocation.trim().toLowerCase());
      if (Array.isArray(c.locations)) c.locations.forEach(l => set.add(l.trim().toLowerCase()));
    });
    return set.size;
  }, [companies]);

  // Filtered companies
  const filteredCompanies = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    const base = !q ? companies : companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.defaultDeliveryLocation && c.defaultDeliveryLocation.toLowerCase().includes(q)) ||
      (Array.isArray(c.locations) && c.locations.some(l => l.toLowerCase().includes(q))) ||
      c.contacts.some(ct =>
        ct.name.toLowerCase().includes(q) ||
        ct.email.toLowerCase().includes(q) ||
        (ct.phone && ct.phone.includes(q))
      )
    );
    return base.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
  }, [companies, searchFilter]);

  // Paginação das Empresas (Opção 3: Master-Detail com Barra Lateral Paginada)
  const [companyPage, setCompanyPage] = useState(1);
  const [companyPageSize, setCompanyPageSize] = useState(10);

  // Reseta para página 1 ao pesquisar ou alterar a quantidade por página
  React.useEffect(() => {
    setCompanyPage(1);
  }, [searchFilter, companyPageSize]);

  const totalCompanyPages = Math.max(1, Math.ceil(filteredCompanies.length / companyPageSize));
  const companyPageSafe = Math.min(Math.max(1, companyPage), totalCompanyPages);

  const paginatedCompanies = useMemo(() => {
    const start = (companyPageSafe - 1) * companyPageSize;
    return filteredCompanies.slice(start, start + companyPageSize);
  }, [filteredCompanies, companyPageSafe, companyPageSize]);

  const selectedCompanyPageIndex = useMemo(() => {
    if (!selectedCompanyId) return 1;
    const idx = filteredCompanies.findIndex(c => c.id === selectedCompanyId);
    if (idx === -1) return 1;
    return Math.floor(idx / companyPageSize) + 1;
  }, [filteredCompanies, selectedCompanyId, companyPageSize]);

  // All buyers
  const allBuyers = useMemo(() => {
    const list: Array<{ company: ClientCompany; contact: ClientContact }> = [];
    companies.forEach(comp => comp.contacts.forEach(contact => list.push({ company: comp, contact })));
    return list;
  }, [companies]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) || filteredCompanies[0] || companies[0];

  // --- Handlers: Company ---
  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    const loc = newCompanyLocation.trim() || 'Brasília - DF';
    const newCompany: ClientCompany = {
      id: `comp-${Date.now()}`,
      name: newCompanyName.trim(),
      prefix: newCompanyPrefix,
      defaultDeliveryLocation: loc,
      locations: [loc],
      contacts: [],
      website: newCompanyWebsite.trim() ? extractCleanDomain(newCompanyWebsite) : undefined,
      lastUsed: new Date().toISOString()
    };
    const updated = [newCompany, ...companies];
    onSaveCompanies(updated);
    setSelectedCompanyId(newCompany.id);
    setCompanyPage(1);
    setNewCompanyName('');
    setNewCompanyLocation('Brasília - DF');
    setNewCompanyWebsite('');
    setNewCompanyPrefix('À');
    setIsAddingCompany(false);
    showToast(`Empresa "${newCompany.prefix} ${newCompany.name}" cadastrada!`);
  };

  const handleStartEditCompany = (comp: ClientCompany) => {
    setEditCompanyName(comp.name);
    setEditCompanyPrefix((comp.prefix as 'À' | 'Ao') || (comp.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À'));
    setEditCompanyLocation(comp.defaultDeliveryLocation || 'Brasília - DF');
    setEditCompanyWebsite(comp.website || (comp.logoUrl && !comp.logoUrl.startsWith('http') ? comp.logoUrl : ''));
    setIsEditingCompany(true);
  };

  const handleSaveEditCompany = (companyId: string) => {
    if (!editCompanyName.trim()) return;
    const loc = editCompanyLocation.trim() || 'Brasília - DF';
    const updated = companies.map(c => {
      if (c.id === companyId) {
        const existingLocs = Array.isArray(c.locations) ? c.locations : [];
        const nextLocs = existingLocs.includes(loc) ? existingLocs : [loc, ...existingLocs];
        return { 
          ...c, 
          name: editCompanyName.trim(), 
          prefix: editCompanyPrefix, 
          defaultDeliveryLocation: loc, 
          locations: nextLocs,
          website: editCompanyWebsite.trim() ? extractCleanDomain(editCompanyWebsite) : undefined
        };
      }
      return c;
    });
    onSaveCompanies(updated);
    setIsEditingCompany(false);
    showToast('Empresa atualizada!');
  };

  const handleDeleteCompanyAction = (companyId: string) => {
    if (onDeleteCompany) {
      onDeleteCompany(companyId);
    } else {
      onSaveCompanies(companies.filter(c => c.id !== companyId));
    }
    const remaining = companies.filter(c => c.id !== companyId);
    setSelectedCompanyId(remaining[0]?.id || '');
    setCompanyIdToDelete(null);
    showToast('Empresa excluída.');
  };

  // --- Handlers: Locations ---
  const handleAddLocationToCompany = (companyId: string) => {
    if (!newLocationName.trim()) return;
    const clean = newLocationName.trim();
    const updated = companies.map(c => {
      if (c.id === companyId) {
        const existing = Array.isArray(c.locations) ? c.locations : (c.defaultDeliveryLocation ? [c.defaultDeliveryLocation] : []);
        if (existing.includes(clean)) return c;
        return { ...c, locations: [...existing, clean], defaultDeliveryLocation: c.defaultDeliveryLocation || clean };
      }
      return c;
    });
    onSaveCompanies(updated);
    setNewLocationName('');
    showToast(`Localidade "${clean}" adicionada!`);
  };

  const handleRemoveLocation = (companyId: string, locToRemove: string) => {
    const updated = companies.map(c => {
      if (c.id === companyId) {
        const existing = Array.isArray(c.locations) ? c.locations : [];
        const nextLocs = existing.filter(l => l !== locToRemove);
        let nextDefault = c.defaultDeliveryLocation;
        if (c.defaultDeliveryLocation === locToRemove) nextDefault = nextLocs[0] || 'Brasília - DF';
        return { ...c, locations: nextLocs.length > 0 ? nextLocs : ['Brasília - DF'], defaultDeliveryLocation: nextDefault || 'Brasília - DF' };
      }
      return c;
    });
    onSaveCompanies(updated);
    showToast('Localidade removida.');
  };

  const handleSetDefaultLocation = (companyId: string, locToSet: string) => {
    onSaveCompanies(companies.map(c => c.id === companyId ? { ...c, defaultDeliveryLocation: locToSet } : c));
    showToast(`"${locToSet}" definida como padrão.`);
  };

  // --- Handlers: Contacts ---
  const handleOpenAddContact = (targetCompanyId?: string) => {
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setContactTitle('Sr.');
    setContactCompanyId(targetCompanyId || selectedCompany?.id || companies[0]?.id || '');
    setIsAddingContact(true);
  };

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactCompanyId) return;
    const newContact: ClientContact = {
      id: `cont-${Date.now()}`,
      name: contactName.trim(),
      title: contactTitle,
      email: contactEmail.toLowerCase().trim(),
      phone: maskPhone(contactPhone.trim()),
      lastUsed: new Date().toISOString()
    };
    onSaveCompanies(companies.map(c => c.id === contactCompanyId ? { ...c, contacts: [...c.contacts, newContact] } : c));
    setIsAddingContact(false);
    showToast(`Comprador "${newContact.name}" cadastrado!`);
  };

  const handleStartEditContact = (contact: ClientContact, compId: string) => {
    setEditingContact(contact);
    setEditingContactCompanyId(compId);
    setEditContactName(contact.name);
    setEditContactTitle((contact.title as any) || 'Sr.');
    setEditContactEmail(contact.email || '');
    setEditContactPhone(contact.phone || '');
    setEditContactTargetCompanyId(compId);
  };

  const handleSaveEditContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact || !editContactName.trim()) return;
    const isTransferring = editContactTargetCompanyId !== editingContactCompanyId;
    const updatedContact: ClientContact = {
      ...editingContact,
      name: editContactName.trim(),
      title: editContactTitle,
      email: editContactEmail.toLowerCase().trim(),
      phone: maskPhone(editContactPhone.trim())
    };
    let updated: ClientCompany[];
    if (isTransferring) {
      updated = companies.map(c => {
        if (c.id === editingContactCompanyId) return { ...c, contacts: c.contacts.filter(ct => ct.id !== editingContact.id) };
        if (c.id === editContactTargetCompanyId) return { ...c, contacts: [...c.contacts, updatedContact] };
        return c;
      });
      showToast('Comprador transferido!');
    } else {
      updated = companies.map(c => {
        if (c.id === editingContactCompanyId) return { ...c, contacts: c.contacts.map(ct => ct.id === editingContact.id ? updatedContact : ct) };
        return c;
      });
      showToast('Comprador atualizado!');
    }
    onSaveCompanies(updated);
    setEditingContact(null);
  };

  const handleDeleteContactAction = (contactId: string, companyId: string) => {
    if (onDeleteContact) {
      onDeleteContact(contactId, companyId);
    } else {
      onSaveCompanies(companies.map(c => c.id === companyId ? { ...c, contacts: c.contacts.filter(ct => ct.id !== contactId) } : c));
    }
    setContactIdToDelete(null);
    showToast('Comprador removido.');
  };

  const handleInitiateQuote = (companyName: string, contact: ClientContact, location?: string) => {
    if (onSelectBuyerForQuote) onSelectBuyerForQuote(companyName, contact, location);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="sq-page-title">Empresas &amp; Compradores</h1>
            <span className="sq-badge-code">CADASTROS ATIVOS</span>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg">CRM Comercial</span>
          </div>
          <p className="sq-page-subtitle">Gestão centralizada de clientes, compradores e locais de entrega.</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="sq-metric-card">
          <div className="flex items-center justify-between mb-1">
            <span className="sq-metric-label">Empresas</span>
            <Building className="w-4 h-4 text-sky-600" />
          </div>
          <div className="sq-metric-value">{totalCompanies}</div>
          <div className="sq-metric-sub">Clientes e órgãos</div>
        </div>
        <div className="sq-metric-card">
          <div className="flex items-center justify-between mb-1">
            <span className="sq-metric-label">Compradores</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="sq-metric-value">{totalContacts}</div>
          <div className="sq-metric-sub">Contatos ativos</div>
        </div>
        <div className="sq-metric-card">
          <div className="flex items-center justify-between mb-1">
            <span className="sq-metric-label">Praças</span>
            <MapPin className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="sq-metric-value">{uniqueLocationsCount}</div>
          <div className="sq-metric-sub">Cidades atendidas</div>
        </div>
        <div className="sq-metric-card">
          <div className="flex items-center justify-between mb-1">
            <span className="sq-metric-label">CRM</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-sm font-bold text-slate-900 font-mono mt-1">Sincronizado</div>
          <div className="sq-metric-sub">Auto-preenchimento ativo</div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Buscar empresa, comprador, e-mail ou cidade..."
            className="sq-input pl-10"
          />
          {searchFilter && (
            <button onClick={() => setSearchFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
          )}
        </div>
        <span className="text-xs text-slate-500 hidden md:block">
          {filteredCompanies.length} empresa(s) · {allBuyers.length} comprador(es)
        </span>
      </div>

      {/* Master-Detail Layout */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col lg:grid lg:grid-cols-12 min-h-[640px]">

        {/* Left: Companies Grid List (Paginada em 2 Colunas - Opção 3) */}
        <div className="lg:col-span-4 xl:col-span-4 border-r border-slate-200 flex flex-col justify-between bg-slate-50/50 p-4 space-y-3 min-h-[640px] max-h-[84vh]">
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="flex items-center justify-between pt-1 shrink-0">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-sky-600" />
                <span>Empresas ({filteredCompanies.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAddingCompany(!isAddingCompany)}
                className="text-xs font-semibold text-sky-700 hover:text-sky-800 flex items-center gap-1 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg border border-sky-200 transition cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Empresa</span>
              </button>
            </div>

            {isAddingCompany && (
              <form onSubmit={handleCreateCompany} className="bg-white p-3 rounded-xl border border-sky-300 shadow-sm space-y-2 animate-in fade-in shrink-0">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800">Cadastrar Empresa</span>
                  <button type="button" onClick={() => setIsAddingCompany(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex gap-1.5">
                  <select
                    value={newCompanyPrefix}
                    onChange={(e) => setNewCompanyPrefix(e.target.value as 'À' | 'Ao')}
                    className="text-xs px-2 py-1.5 bg-sky-50 border border-sky-300 rounded-lg font-bold text-sky-900 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs"
                    title="Escolha o prefixo de tratamento da empresa (À ou Ao)"
                  >
                    <option value="À">À</option>
                    <option value="Ao">Ao</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Nome da empresa..."
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-medium"
                    autoFocus
                    required
                  />
                </div>
                <input type="text" placeholder="Local padrão (Ex: Brasília - DF)" value={newCompanyLocation} onChange={(e) => setNewCompanyLocation(e.target.value)} className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500" />
                <div className="relative flex items-center">
                  <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input 
                    type="text" 
                    placeholder="Site da empresa (ex: ubec.edu.br ou sabin.com.br)" 
                    value={newCompanyWebsite} 
                    onChange={(e) => setNewCompanyWebsite(e.target.value)} 
                    className="w-full text-xs pl-8 pr-8 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900" 
                  />
                  {extractCleanDomain(newCompanyWebsite).includes('.') && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <WebsiteFaviconPreview website={newCompanyWebsite} className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <span className="text-[9.5px] text-slate-400 block -mt-1">
                  💡 Basta o site principal — o sistema captura o ícone oficial da aba do navegador.
                </span>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button type="button" onClick={() => setIsAddingCompany(false)} className="text-xs px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancelar</button>
                  <button type="submit" className="text-xs px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg cursor-pointer">Salvar</button>
                </div>
              </form>
            )}

            {/* Grid de Empresas em 2 Colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5 flex-1 overflow-y-auto pr-0.5 custom-scrollbar content-start">
              {paginatedCompanies.map(comp => {
                const isSelected = selectedCompany?.id === comp.id;
                const displayPrefix = comp.prefix || (comp.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À');

                return (
                  <div
                    key={comp.id}
                    onClick={() => { setSelectedCompanyId(comp.id); setIsEditingCompany(false); setEditingContact(null); }}
                    className={`p-2.5 rounded-2xl cursor-pointer border transition-all duration-150 flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-sky-50/90 border-sky-400 shadow-xs ring-2 ring-sky-300/40'
                        : 'bg-white hover:bg-slate-50/90 border-slate-200/90 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    {/* Card Top: Logo / Avatar + Name + Location */}
                    <div className="flex items-center gap-2.5">
                      <CompanyLogoBadge company={comp} size="sm" />
                      <div className="min-w-0 flex-1">
                        <h4 className={`text-xs font-bold leading-tight truncate ${isSelected ? 'text-sky-950' : 'text-slate-900'}`} title={comp.name}>
                          {comp.name}
                        </h4>
                        <p className="text-[10px] text-slate-500 truncate flex items-center gap-0.5 mt-0.5" title={comp.defaultDeliveryLocation || 'Brasília - DF'}>
                          <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          <span className="truncate">{comp.defaultDeliveryLocation || 'Brasília - DF'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Card Footer: Status Ativo + Prefix / Buyers count + Delete */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100/80">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Ativo
                        </span>
                        <span className="text-[9.5px] font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.2 rounded">
                          {displayPrefix}
                        </span>
                        <span className="text-[9.5px] text-slate-500 font-medium">
                          {comp.contacts.length} comp.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedCompanyId(comp.id); setCompanyIdToDelete(comp.id); }}
                        className="text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition cursor-pointer"
                        title="Excluir empresa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredCompanies.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-400 text-xs">Nenhuma empresa encontrada.</div>
              )}
            </div>
          </div>

          {/* Rodapé de Paginação Compacto e Moderno (Opção 3) */}
          {filteredCompanies.length > 0 && (
            <div className="pt-3 border-t border-slate-200 flex flex-col gap-2 shrink-0 bg-slate-50/70 rounded-b-xl">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-1">
                <span>
                  {(companyPageSafe - 1) * companyPageSize + 1}–{Math.min(filteredCompanies.length, companyPageSafe * companyPageSize)} de {filteredCompanies.length} empresas
                </span>
                <select
                  value={companyPageSize}
                  onChange={(e) => setCompanyPageSize(Number(e.target.value))}
                  className="bg-white border border-slate-200 text-slate-700 rounded-lg px-2 py-0.5 text-[11px] font-semibold focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs"
                  title="Empresas por página"
                >
                  <option value={8}>8 por pág.</option>
                  <option value={10}>10 por pág.</option>
                  <option value={12}>12 por pág.</option>
                  <option value={20}>20 por pág.</option>
                </select>
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCompanyPage(prev => Math.max(1, prev - 1))}
                  disabled={companyPageSafe === 1}
                  className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer shadow-2xs"
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-xs font-bold text-slate-700 px-3 py-1 bg-white border border-slate-200 rounded-xl shadow-2xs font-mono">
                  Página <span className="text-sky-700 font-black">{companyPageSafe}</span> de {totalCompanyPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCompanyPage(prev => Math.min(totalCompanyPages, prev + 1))}
                  disabled={companyPageSafe === totalCompanyPages}
                  className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer shadow-2xs"
                  title="Próxima Página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {selectedCompanyPageIndex !== companyPageSafe && selectedCompany && (
                <button
                  type="button"
                  onClick={() => setCompanyPage(selectedCompanyPageIndex)}
                  className="w-full text-[10px] text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg py-1 px-2 text-center transition font-semibold truncate cursor-pointer mt-0.5"
                  title={`Ir para a página onde está a empresa ${selectedCompany.name}`}
                >
                  📍 Ver na lista: {selectedCompany.name} (Pág. {selectedCompanyPageIndex})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Company Detail + Buyers Hero Banner (Espaço Ampliado para Compradores) */}
        <div className="lg:col-span-8 xl:col-span-8 flex flex-col p-6 overflow-y-auto space-y-5 min-h-[640px] max-h-[84vh] bg-white">
          {selectedCompany ? (
            <>
              {/* Company Header Hero Banner Card */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
                {isEditingCompany ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveEditCompany(selectedCompany.id); }} className="bg-sky-50/70 border border-sky-300 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5"><Edit3 className="w-3.5 h-3.5 text-sky-600" /> Editar Dados da Empresa</span>
                      <button type="button" onClick={() => setIsEditingCompany(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome da Empresa / Órgão</label>
                        <div className="flex gap-1.5">
                          <select
                            value={editCompanyPrefix}
                            onChange={(e) => setEditCompanyPrefix(e.target.value as 'À' | 'Ao')}
                            className="text-xs px-2 py-1.5 bg-sky-50 border border-sky-300 rounded-lg font-bold text-sky-900 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs"
                            title="Escolha o prefixo de tratamento da empresa (À ou Ao)"
                          >
                            <option value="À">À</option>
                            <option value="Ao">Ao</option>
                          </select>
                          <input
                            type="text"
                            required
                            value={editCompanyName}
                            onChange={(e) => setEditCompanyName(e.target.value)}
                            className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-bold text-slate-900"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Local de Entrega Padrão</label>
                        <input type="text" value={editCompanyLocation} onChange={(e) => setEditCompanyLocation(e.target.value)} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-sky-600" />
                          <span>Site da Empresa (captura a logo da aba automaticamente)</span>
                        </label>
                        <div className="relative flex items-center">
                          <input 
                            type="text" 
                            placeholder="Ex: ubec.edu.br ou sabin.com.br" 
                            value={editCompanyWebsite} 
                            onChange={(e) => setEditCompanyWebsite(e.target.value)} 
                            className="w-full text-xs px-3 pr-9 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900 font-medium" 
                          />
                          {extractCleanDomain(editCompanyWebsite).includes('.') && (
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                              <WebsiteFaviconPreview website={editCompanyWebsite} className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Basta colocar o endereço do site principal (ex: <code>sabin.com.br</code>) que o sistema puxa o ícone oficial da aba do navegador.
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setIsEditingCompany(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium cursor-pointer">Cancelar</button>
                      <button type="submit" className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer">
                        <Save className="w-3.5 h-3.5" /><span>Salvar</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    {/* Left: Avatar / Logo + Title + Subtitle */}
                    <div className="flex items-center gap-3.5">
                      <CompanyLogoBadge company={selectedCompany} size="lg" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{selectedCompany.name}</h2>
                          {selectedCompany.defaultDeliveryLocation && (
                            <span className="text-xs text-slate-500 font-medium">
                              {selectedCompany.defaultDeliveryLocation}
                            </span>
                          )}
                          {selectedCompany.website && (
                            <a
                              href={`https://${extractCleanDomain(selectedCompany.website)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-sky-600 hover:text-sky-800 hover:underline flex items-center gap-1 font-medium ml-1"
                              title="Abrir site oficial da empresa"
                            >
                              <Globe className="w-3 h-3" />
                              <span>{extractCleanDomain(selectedCompany.website)}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.2 rounded text-[10px]">
                            {selectedCompany.prefix || (selectedCompany.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À')}
                          </span>
                          <span>Cliente cadastrado no sistema comercial</span>
                        </p>
                      </div>
                    </div>

                    {/* Right: Status Pills + Actions */}
                    <div className="flex items-center gap-3 self-end sm:self-center flex-wrap">
                      <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Ativo
                          </span>
                          <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-xs font-bold font-mono">
                            CRM Master
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAddContact(selectedCompany.id)}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-xs flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Novo Comprador</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditCompany(selectedCompany)}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold px-3 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-2xs flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Editar</span>
                        </button>
                        {companyIdToDelete === selectedCompany.id ? (
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 px-2 py-1 rounded-xl">
                            <span className="text-[11px] font-bold text-red-700">Excluir?</span>
                            <button type="button" onClick={() => handleDeleteCompanyAction(selectedCompany.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs font-bold cursor-pointer">Sim</button>
                            <button type="button" onClick={() => setCompanyIdToDelete(null)} className="px-2 py-1 bg-white text-slate-700 border rounded text-xs cursor-pointer">Não</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCompanyIdToDelete(selectedCompany.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                            title="Excluir Empresa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Localidades de Entrega */}
              <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-sky-600" />
                  <h4 className="text-xs font-bold text-slate-800">Localidades de Entrega ({selectedCompany.locations?.length || 1})</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(selectedCompany.locations && selectedCompany.locations.length > 0
                    ? selectedCompany.locations
                    : [selectedCompany.defaultDeliveryLocation || 'Brasília']
                  ).map(loc => {
                    const isDefault = selectedCompany.defaultDeliveryLocation === loc;
                    return (
                      <div key={loc} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition ${isDefault ? 'bg-sky-50 border-sky-300 text-sky-950 font-semibold shadow-sm ring-1 ring-sky-200' : 'bg-white border-slate-200 text-slate-700 hover:border-sky-300'}`}>
                        <button type="button" onClick={() => handleSetDefaultLocation(selectedCompany.id, loc)} className={`transition ${isDefault ? 'text-amber-500 font-bold' : 'text-slate-300 hover:text-amber-500'}`} title={isDefault ? 'Destino padrão' : 'Definir como padrão'}>★</button>
                        <span>{loc}</span>
                        {isDefault && <span className="text-[9.5px] px-1.5 py-0.5 bg-sky-600 text-white rounded font-bold uppercase tracking-wider">Padrão</span>}
                        <button type="button" onClick={() => handleRemoveLocation(selectedCompany.id, loc)} className="text-slate-400 hover:text-red-500 ml-1 p-0.5 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); handleAddLocationToCompany(selectedCompany.id); }} className="flex items-center gap-2 pt-1">
                  <input type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} placeholder="Adicionar cidade/destino (ex: Joinville - SC)..." className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500" />
                  <button type="submit" disabled={!newLocationName.trim()} className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 shrink-0 transition cursor-pointer">
                    <Plus className="w-3.5 h-3.5" /><span>Adicionar</span>
                  </button>
                </form>
              </div>

              {/* Form Editar Comprador */}
              {editingContact && (
                <form onSubmit={handleSaveEditContact} className="bg-amber-50/60 border border-amber-300 rounded-2xl p-4 shadow-sm space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-1 border-b border-amber-200">
                    <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5"><Edit3 className="w-3.5 h-3.5 text-amber-600" /><span>Editar: <strong>{editingContact.name}</strong></span></h4>
                    <button type="button" onClick={() => setEditingContact(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome do Comprador</label>
                      <div className="flex gap-1.5">
                        <select value={editContactTitle} onChange={(e) => setEditContactTitle(e.target.value as any)} className="text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-medium focus:outline-none focus:border-amber-500">
                          <option value="Sr.">Sr.</option><option value="Srta.">Srta.</option><option value="Sra.">Sra.</option><option value="Dr.">Dr.</option><option value="Dra.">Dra.</option>
                        </select>
                        <input type="text" required value={editContactName} onChange={(e) => setEditContactName(e.target.value)} className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-bold text-slate-900" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-sky-800 mb-1 flex items-center gap-1"><Building className="w-3.5 h-3.5 text-sky-600" /><span>Empresa Vinculada</span></label>
                      <select value={editContactTargetCompanyId} onChange={(e) => setEditContactTargetCompanyId(e.target.value)} className="w-full text-xs px-3 py-1.5 bg-white border-2 border-sky-300 rounded-lg font-bold text-sky-900 focus:outline-none focus:border-sky-600 shadow-sm cursor-pointer">
                        {companies.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })).map(c => <option key={c.id} value={c.id}>{c.name}{c.id === editingContactCompanyId ? ' (Atual)' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">E-mail</label>
                      <input type="email" value={editContactEmail} onChange={(e) => setEditContactEmail(e.target.value.toLowerCase())} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-slate-900 lowercase" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Telefone</label>
                      <input type="text" maxLength={15} value={maskPhone(editContactPhone)} onChange={(e) => setEditContactPhone(maskPhone(e.target.value))} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-slate-900" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setEditingContact(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium cursor-pointer">Cancelar</button>
                    <button type="submit" className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer">
                      <Save className="w-3.5 h-3.5" /><span>Salvar Comprador</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Form Novo Comprador */}
              {isAddingContact && (
                <form onSubmit={handleCreateContact} className="bg-sky-50/50 border border-sky-300 rounded-2xl p-4 shadow-sm space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-1 border-b border-sky-200">
                    <h4 className="text-xs font-bold text-sky-900 flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-sky-600" /><span>Novo Comprador</span></h4>
                    <button type="button" onClick={() => setIsAddingContact(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome Completo</label>
                      <div className="flex gap-1.5">
                        <select value={contactTitle} onChange={(e) => setContactTitle(e.target.value as any)} className="text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-medium focus:outline-none focus:border-sky-500">
                          <option value="Sr.">Sr.</option><option value="Srta.">Srta.</option><option value="Sra.">Sra.</option><option value="Dr.">Dr.</option><option value="Dra.">Dra.</option>
                        </select>
                        <input type="text" required placeholder="Ex: Alex Pereira" value={contactName} onChange={(e) => setContactName(e.target.value)} className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-bold text-slate-900" autoFocus />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-sky-800 mb-1 flex items-center gap-1"><Building className="w-3.5 h-3.5 text-sky-600" /><span>Pertence à Empresa</span></label>
                      <select value={contactCompanyId} onChange={(e) => setContactCompanyId(e.target.value)} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:outline-none focus:border-sky-500 cursor-pointer">
                        {companies.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">E-mail</label>
                      <input type="email" required placeholder="Ex: alex@empresa.com.br" value={contactEmail} onChange={(e) => setContactEmail(e.target.value.toLowerCase())} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900 lowercase" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Telefone</label>
                      <input type="text" placeholder="(61) 99999-9999" maxLength={15} value={maskPhone(contactPhone)} onChange={(e) => setContactPhone(maskPhone(e.target.value))} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setIsAddingContact(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium cursor-pointer">Cancelar</button>
                    <button type="submit" className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer">Salvar Comprador</button>
                  </div>
                </form>
              )}

              {/* Lista de Compradores Cadastrados (Estilo Tabela / Cards do Mockup) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base md:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-600" />
                    <span>Compradores Cadastrados ({selectedCompany.contacts.length})</span>
                  </h3>
                </div>

                {/* Cabeçalho da Tabela / Lista */}
                <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-100/90 rounded-xl text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <div className="col-span-3">Comprador</div>
                  <div className="col-span-3">E-mail</div>
                  <div className="col-span-3">Telefone</div>
                  <div className="col-span-3 text-right pr-2">Ações</div>
                </div>

                {/* Cards de Compradores */}
                <div className="space-y-2">
                  {(selectedCompany.contacts || [])
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }))
                    .map((contact) => (
                    <div
                      key={contact.id}
                      className="p-4 bg-white hover:bg-slate-50/70 border border-slate-200/90 rounded-2xl shadow-2xs hover:border-sky-300 transition-all flex flex-col md:grid md:grid-cols-12 md:items-center gap-3"
                    >
                      {/* Col 1: Comprador */}
                      <div className="md:col-span-3 min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 leading-snug truncate">
                          {contact.title ? `${contact.title} ` : ''}{contact.name}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {contact.id.slice(-6)}</span>
                      </div>

                      {/* Col 2: E-mail */}
                      <div className="md:col-span-3 text-xs text-slate-700 truncate min-w-0">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="hover:text-sky-700 truncate flex items-center gap-1.5 text-slate-600">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 italic">Não informado</span>
                        )}
                      </div>

                      {/* Col 3: Telefone */}
                      <div className="md:col-span-3 text-xs text-slate-700 font-mono whitespace-nowrap">
                        {contact.phone ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="whitespace-nowrap">{contact.phone}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">--</span>
                        )}
                      </div>

                      {/* Col 4: Ações */}
                      <div className="md:col-span-3 flex items-center justify-end gap-1.5 shrink-0 whitespace-nowrap">
                        {onSelectBuyerForQuote && (
                          <button
                            type="button"
                            onClick={() => handleInitiateQuote(selectedCompany.name, contact, selectedCompany.defaultDeliveryLocation)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-2xs flex items-center gap-1 cursor-pointer transition"
                            title="Iniciar nova cotação com este comprador"
                          >
                            <span>Cotar</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleStartEditContact(contact, selectedCompany.id)}
                          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2.5 py-1.5 rounded-lg text-xs shadow-2xs flex items-center gap-1 cursor-pointer transition"
                          title="Editar comprador"
                        >
                          <span>Editar</span>
                        </button>
                        {contactIdToDelete === contact.id ? (
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-lg">
                            <button type="button" onClick={() => handleDeleteContactAction(contact.id, selectedCompany.id)} className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[10.5px] font-bold cursor-pointer">Sim</button>
                            <button type="button" onClick={() => setContactIdToDelete(null)} className="px-1.5 py-0.5 bg-white text-slate-700 border rounded text-[10.5px] cursor-pointer">Não</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setContactIdToDelete(contact.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Excluir comprador"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedCompany.contacts.length === 0 && (
                    <div className="text-center py-12 text-slate-400 text-xs bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                      <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-500">Nenhum comprador cadastrado.</p>
                      <p className="mt-0.5">Clique em "Novo Comprador" acima para adicionar.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-400 text-xs">
              <Building className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-500">Selecione uma empresa na lista ao lado.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
