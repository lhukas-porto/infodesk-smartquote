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
  Building2,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  PlusCircle,
  Clock,
  Save
} from 'lucide-react';
import { ClientCompany, ClientContact } from '../types';
import { maskPhone } from '../utils/aiEmailParser';

interface ClientManagementViewProps {
  companies: ClientCompany[];
  onSaveCompanies: (companies: ClientCompany[]) => void;
  onDeleteCompany?: (companyId: string) => void;
  onDeleteContact?: (contactId: string, companyId: string) => void;
  onSelectBuyerForQuote?: (companyName: string, contact: ClientContact, location?: string) => void;
  onOpenEmailScanner?: () => void;
}

export const ClientManagementView: React.FC<ClientManagementViewProps> = ({
  companies,
  onSaveCompanies,
  onDeleteCompany,
  onDeleteContact,
  onSelectBuyerForQuote,
  onOpenEmailScanner
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

  // Edit Company state
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyPrefix, setEditCompanyPrefix] = useState<'À' | 'Ao'>('À');
  const [editCompanyLocation, setEditCompanyLocation] = useState('');

  // New Contact form state
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState<'Sr.' | 'Srta.' | 'Sra.' | 'Dr.' | 'Dra.'>('Sr.');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRole, setContactRole] = useState('Comprador');
  const [contactCompanyId, setContactCompanyId] = useState<string>('');

  // Edit Contact state
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [editingContactCompanyId, setEditingContactCompanyId] = useState<string>('');
  const [editContactName, setEditContactName] = useState('');
  const [editContactTitle, setEditContactTitle] = useState<'Sr.' | 'Srta.' | 'Sra.' | 'Dr.' | 'Dra.'>('Sr.');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editContactRole, setEditContactRole] = useState('Comprador');
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
    if (!q) return companies;
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.defaultDeliveryLocation && c.defaultDeliveryLocation.toLowerCase().includes(q)) ||
      (Array.isArray(c.locations) && c.locations.some(l => l.toLowerCase().includes(q))) ||
      c.contacts.some(ct =>
        ct.name.toLowerCase().includes(q) ||
        ct.email.toLowerCase().includes(q) ||
        (ct.phone && ct.phone.includes(q)) ||
        (ct.role && ct.role.toLowerCase().includes(q))
      )
    );
  }, [companies, searchFilter]);

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
      lastUsed: new Date().toISOString()
    };
    const updated = [newCompany, ...companies];
    onSaveCompanies(updated);
    setSelectedCompanyId(newCompany.id);
    setNewCompanyName('');
    setNewCompanyPrefix('À');
    setIsAddingCompany(false);
    showToast(`Empresa "${newCompany.prefix} ${newCompany.name}" cadastrada!`);
  };

  const handleStartEditCompany = (comp: ClientCompany) => {
    setEditCompanyName(comp.name);
    setEditCompanyPrefix((comp.prefix as 'À' | 'Ao') || (comp.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À'));
    setEditCompanyLocation(comp.defaultDeliveryLocation || 'Brasília - DF');
    setIsEditingCompany(true);
  };

  const handleSaveEditCompany = (companyId: string) => {
    if (!editCompanyName.trim()) return;
    const loc = editCompanyLocation.trim() || 'Brasília - DF';
    const updated = companies.map(c => {
      if (c.id === companyId) {
        const existingLocs = Array.isArray(c.locations) ? c.locations : [];
        const nextLocs = existingLocs.includes(loc) ? existingLocs : [loc, ...existingLocs];
        return { ...c, name: editCompanyName.trim(), prefix: editCompanyPrefix, defaultDeliveryLocation: loc, locations: nextLocs };
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
    setContactRole('Comprador');
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
      role: contactRole.trim() || 'Comprador',
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
    setEditContactRole(contact.role || 'Comprador');
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
      phone: maskPhone(editContactPhone.trim()),
      role: editContactRole.trim() || 'Comprador'
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
        <div className="flex items-center gap-2.5 flex-wrap">
          {onOpenEmailScanner && (
            <button type="button" onClick={onOpenEmailScanner} className="sq-btn-neutral flex items-center gap-1.5" title="Escanear e-mails com IA">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Escanear E-mails (IA)</span>
            </button>
          )}
          <button type="button" onClick={() => setIsAddingCompany(true)} className="sq-btn-primary flex items-center gap-1.5">
            <Building2 className="w-4 h-4" />
            <span>+ Nova Empresa</span>
          </button>
          <button type="button" onClick={() => handleOpenAddContact()} disabled={companies.length === 0} className="sq-btn-emerald flex items-center gap-1.5">
            <User className="w-4 h-4" />
            <span>+ Novo Comprador</span>
          </button>
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
            placeholder="Buscar empresa, comprador, cargo, e-mail ou cidade..."
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
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col md:grid md:grid-cols-12 min-h-[600px]">

        {/* Left: Companies List */}
        <div className="md:col-span-4 border-r border-slate-200 flex flex-col bg-slate-50/40 p-4 space-y-3 overflow-y-auto max-h-[75vh]">
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Empresas ({filteredCompanies.length})
            </span>
            <button
              type="button"
              onClick={() => setIsAddingCompany(!isAddingCompany)}
              className="text-[11px] font-semibold text-sky-700 hover:text-sky-800 flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Empresa</span>
            </button>
          </div>

          {isAddingCompany && (
            <form onSubmit={handleCreateCompany} className="bg-white p-3 rounded-xl border border-sky-300 shadow-sm space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800">Cadastrar Empresa</span>
                <button type="button" onClick={() => setIsAddingCompany(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
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
              <div className="flex justify-end gap-1.5 pt-1">
                <button type="button" onClick={() => setIsAddingCompany(false)} className="text-xs px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" className="text-xs px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg">Salvar</button>
              </div>
            </form>
          )}

          <div className="space-y-1.5 flex-1 overflow-y-auto pr-0.5">
            {filteredCompanies.map(comp => {
              const isSelected = selectedCompany?.id === comp.id;
              const displayPrefix = comp.prefix || (comp.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À');
              return (
                <div
                  key={comp.id}
                  onClick={() => { setSelectedCompanyId(comp.id); setIsEditingCompany(false); setEditingContact(null); }}
                  className={`p-3 rounded-xl cursor-pointer border transition space-y-1 ${isSelected ? 'bg-sky-50/90 border-sky-400 shadow-sm' : 'bg-white hover:bg-slate-100 border-slate-200/80'}`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className={`text-xs font-bold leading-snug line-clamp-2 ${isSelected ? 'text-sky-900' : 'text-slate-800'}`}>
                      <span className="inline-block text-[10px] font-mono font-bold text-sky-700 bg-sky-100/80 border border-sky-200 px-1 py-0.2 rounded mr-1">
                        {displayPrefix}
                      </span>
                      {comp.name}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{comp.contacts.length} comp.</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedCompanyId(comp.id); setCompanyIdToDelete(comp.id); }}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {comp.defaultDeliveryLocation && (
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{comp.defaultDeliveryLocation}</span>
                    </p>
                  )}
                </div>
              );
            })}
            {filteredCompanies.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">Nenhuma empresa encontrada.</div>
            )}
          </div>
        </div>

        {/* Right: Company Detail + Buyers */}
        <div className="md:col-span-8 flex flex-col p-6 overflow-y-auto space-y-5 max-h-[75vh]">
          {selectedCompany ? (
            <>
              {/* Company Header */}
              <div className="pb-4 border-b border-slate-200">
                {isEditingCompany ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveEditCompany(selectedCompany.id); }} className="bg-sky-50/70 border border-sky-300 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5"><Edit3 className="w-3.5 h-3.5 text-sky-600" /> Editar Dados da Empresa</span>
                      <button type="button" onClick={() => setIsEditingCompany(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
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
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setIsEditingCompany(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium">Cancelar</button>
                      <button type="submit" className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5">
                        <Save className="w-3.5 h-3.5" /><span>Salvar</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 uppercase tracking-wider">Empresa Selecionada</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200 shadow-2xs">
                          {selectedCompany.prefix || (selectedCompany.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À')}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 leading-tight">{selectedCompany.name}</h3>
                      </div>
                      {selectedCompany.defaultDeliveryLocation && (
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-sky-600" />
                          <span>Entrega padrão: {selectedCompany.defaultDeliveryLocation}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => handleStartEditCompany(selectedCompany)} className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-sky-600" /><span>Editar</span>
                      </button>
                      <button type="button" onClick={() => handleOpenAddContact(selectedCompany.id)} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" /><span>Novo Comprador</span>
                      </button>
                      {companyIdToDelete === selectedCompany.id ? (
                        <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl animate-in fade-in">
                          <span className="text-[11px] font-bold text-red-700">Excluir?</span>
                          <button type="button" onClick={() => handleDeleteCompanyAction(selectedCompany.id)} className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold">Sim</button>
                          <button type="button" onClick={() => setCompanyIdToDelete(null)} className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold">Não</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setCompanyIdToDelete(selectedCompany.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl transition" title="Excluir Empresa">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Localidades */}
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
                        <button type="button" onClick={() => handleRemoveLocation(selectedCompany.id, loc)} className="text-slate-400 hover:text-red-500 ml-1 p-0.5"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); handleAddLocationToCompany(selectedCompany.id); }} className="flex items-center gap-2 pt-1">
                  <input type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} placeholder="Adicionar cidade/destino (ex: Joinville - SC)..." className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500" />
                  <button type="submit" disabled={!newLocationName.trim()} className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 shrink-0 transition">
                    <Plus className="w-3.5 h-3.5" /><span>Adicionar</span>
                  </button>
                </form>
              </div>

              {/* Form Editar Comprador */}
              {editingContact && (
                <form onSubmit={handleSaveEditContact} className="bg-amber-50/60 border border-amber-300 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-1 border-b border-amber-200">
                    <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5"><Edit3 className="w-3.5 h-3.5 text-amber-600" /><span>Editar: <strong>{editingContact.name}</strong></span></h4>
                    <button type="button" onClick={() => setEditingContact(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
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
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.id === editingContactCompanyId ? ' (Atual)' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cargo / Função</label>
                      <input type="text" value={editContactRole} onChange={(e) => setEditContactRole(e.target.value)} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-slate-900" />
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
                    <button type="button" onClick={() => setEditingContact(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium">Cancelar</button>
                    <button type="submit" className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5" /><span>Salvar Comprador</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Form Novo Comprador */}
              {isAddingContact && (
                <form onSubmit={handleCreateContact} className="bg-sky-50/50 border border-sky-300 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-1 border-b border-sky-200">
                    <h4 className="text-xs font-bold text-sky-900 flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-sky-600" /><span>Novo Comprador</span></h4>
                    <button type="button" onClick={() => setIsAddingContact(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
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
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cargo</label>
                      <input type="text" placeholder="Ex: Comprador / Suprimentos" value={contactRole} onChange={(e) => setContactRole(e.target.value)} className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900" />
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
                    <button type="button" onClick={() => setIsAddingContact(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium">Cancelar</button>
                    <button type="submit" className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-sm">Salvar Comprador</button>
                  </div>
                </form>
              )}

              {/* Lista de Compradores */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Compradores da {selectedCompany.name.split('—')[0].split('-')[0].trim()} ({selectedCompany.contacts.length})</span>
                </h4>
                <div className="grid grid-cols-1 gap-2.5">
                  {selectedCompany.contacts.map((contact) => (
                    <div key={contact.id} className="p-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl shadow-sm hover:border-sky-300 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{contact.title || ''} {contact.name}</span>
                          {contact.role && <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">{contact.role}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          {contact.email && <span className="flex items-center gap-1 text-sky-700"><Mail className="w-3 h-3 text-slate-400" />{contact.email}</span>}
                          {contact.phone && <span className="flex items-center gap-1 text-slate-700 font-medium"><Phone className="w-3 h-3 text-emerald-600" />{contact.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        {onSelectBuyerForQuote && (
                          <button type="button" onClick={() => handleInitiateQuote(selectedCompany.name, contact, selectedCompany.defaultDeliveryLocation)} className="px-2.5 py-1.5 bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-sky-600" /><span>Cotar</span>
                          </button>
                        )}
                        <button type="button" onClick={() => handleStartEditContact(contact, selectedCompany.id)} className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm">
                          <Edit3 className="w-3.5 h-3.5 text-amber-600" /><span>Editar</span>
                        </button>
                        {contactIdToDelete === contact.id ? (
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 px-2 py-1 rounded-lg animate-in fade-in">
                            <span className="text-[10.5px] font-bold text-red-700">Excluir?</span>
                            <button type="button" onClick={() => handleDeleteContactAction(contact.id, selectedCompany.id)} className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10.5px] font-bold">Sim</button>
                            <button type="button" onClick={() => setContactIdToDelete(null)} className="px-1.5 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10.5px] font-semibold">Não</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setContactIdToDelete(contact.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedCompany.contacts.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-500">Nenhum comprador cadastrado.</p>
                      <p className="mt-0.5">Clique em "Novo Comprador" acima.</p>
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
