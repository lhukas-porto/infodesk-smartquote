import React, { useState } from 'react';
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
  Save,
  Sparkles
} from 'lucide-react';
import { ClientCompany, ClientContact } from '../types';
import { maskPhone } from '../utils/aiEmailParser';

interface ClientManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: ClientCompany[];
  onSaveCompanies: (companies: ClientCompany[]) => void;
  onDeleteCompany?: (companyId: string) => void;
  onDeleteContact?: (contactId: string, companyId: string) => void;
  onSelectBuyerForQuote?: (companyName: string, contact: ClientContact) => void;
  onOpenEmailScanner?: () => void;
}

export const ClientManagementModal: React.FC<ClientManagementModalProps> = ({
  isOpen,
  onClose,
  companies,
  onSaveCompanies,
  onDeleteCompany,
  onDeleteContact,
  onSelectBuyerForQuote,
  onOpenEmailScanner
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id || '');
  const [companyIdToDelete, setCompanyIdToDelete] = useState<string | null>(null);
  const [contactIdToDelete, setContactIdToDelete] = useState<string | null>(null);
  
  // New Company form state
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyLocation, setNewCompanyLocation] = useState('Brasília - DF');

  // Edit Company state
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState('');
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
  const [editContactName, setEditContactName] = useState('');
  const [editContactTitle, setEditContactTitle] = useState<'Sr.' | 'Srta.' | 'Sra.' | 'Dr.' | 'Dra.'>('Sr.');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editContactRole, setEditContactRole] = useState('Comprador');
  const [editContactTargetCompanyId, setEditContactTargetCompanyId] = useState<string>('');
  const [newLocationName, setNewLocationName] = useState('');
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (companyIdToDelete) {
          setCompanyIdToDelete(null);
        } else if (contactIdToDelete) {
          setContactIdToDelete(null);
        } else if (isAddingCompany) {
          setIsAddingCompany(false);
        } else if (isEditingCompany) {
          setIsEditingCompany(false);
        } else if (isAddingContact) {
          setIsAddingContact(false);
        } else if (editingContact) {
          setEditingContact(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, companyIdToDelete, contactIdToDelete, isAddingCompany, isEditingCompany, isAddingContact, editingContact]);

  if (!isOpen) return null;

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    c.contacts.some(ct => 
      ct.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      ct.email.toLowerCase().includes(searchFilter.toLowerCase())
    )
  );

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) || filteredCompanies[0] || companies[0];

  // 1. CRIAR NOVA EMPRESA
  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    const loc = newCompanyLocation.trim() || 'Brasília - DF';
    const newCompany: ClientCompany = {
      id: `comp-${Date.now()}`,
      name: newCompanyName.trim(),
      defaultDeliveryLocation: loc,
      locations: [loc],
      contacts: [],
      lastUsed: new Date().toISOString()
    };

    const updated = [newCompany, ...companies];
    onSaveCompanies(updated);
    setSelectedCompanyId(newCompany.id);
    setNewCompanyName('');
    setIsAddingCompany(false);
  };

  // 2. EDITAR EMPRESA EXISTENTE
  const handleStartEditCompany = () => {
    if (!selectedCompany) return;
    setEditCompanyName(selectedCompany.name);
    setEditCompanyLocation(selectedCompany.defaultDeliveryLocation || 'Brasília - DF');
    setIsEditingCompany(true);
  };

  const handleSaveEditCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !editCompanyName.trim()) return;

    const loc = editCompanyLocation.trim() || 'Brasília - DF';
    const updated = companies.map(c => {
      if (c.id === selectedCompany.id) {
        const existingLocs = Array.isArray(c.locations) ? c.locations : [];
        const nextLocs = existingLocs.includes(loc) ? existingLocs : [loc, ...existingLocs];
        return {
          ...c,
          name: editCompanyName.trim(),
          defaultDeliveryLocation: loc,
          locations: nextLocs
        };
      }
      return c;
    });

    onSaveCompanies(updated);
    setIsEditingCompany(false);
  };

  // 2b. GERENCIAMENTO DE MÚLTIPLAS LOCALIDADES DA EMPRESA
  const handleAddLocationToCompany = (companyId: string, locName: string) => {
    if (!locName.trim()) return;
    const clean = locName.trim();
    const updated = companies.map(c => {
      if (c.id === companyId) {
        const existing = Array.isArray(c.locations) ? c.locations : (c.defaultDeliveryLocation ? [c.defaultDeliveryLocation] : []);
        if (existing.includes(clean)) return c;
        return {
          ...c,
          locations: [...existing, clean],
          defaultDeliveryLocation: c.defaultDeliveryLocation || clean
        };
      }
      return c;
    });
    onSaveCompanies(updated);
    setNewLocationName('');
  };

  const handleRemoveLocationFromCompany = (companyId: string, locToRemove: string) => {
    const updated = companies.map(c => {
      if (c.id === companyId) {
        const existing = Array.isArray(c.locations) ? c.locations : [];
        const nextLocs = existing.filter(l => l !== locToRemove);
        let nextDefault = c.defaultDeliveryLocation;
        if (c.defaultDeliveryLocation === locToRemove) {
          nextDefault = nextLocs[0] || 'Brasília - DF';
        }
        return {
          ...c,
          locations: nextLocs.length > 0 ? nextLocs : ['Brasília - DF'],
          defaultDeliveryLocation: nextDefault || 'Brasília - DF'
        };
      }
      return c;
    });
    onSaveCompanies(updated);
  };

  const handleSetDefaultLocation = (companyId: string, locToSet: string) => {
    const updated = companies.map(c => {
      if (c.id === companyId) {
        return {
          ...c,
          defaultDeliveryLocation: locToSet
        };
      }
      return c;
    });
    onSaveCompanies(updated);
  };

  // 3. CRIAR NOVO COMPRADOR (E PODER ESCOLHER QUAL EMPRESA ELE PERTENCE)
  const handleStartAddContact = () => {
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setContactRole('Comprador');
    setContactTitle('Sr.');
    setContactCompanyId(selectedCompany?.id || companies[0]?.id || '');
    setIsAddingContact(true);
  };

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCompId = contactCompanyId || selectedCompany?.id;
    if (!contactName.trim() || !targetCompId) return;

    const newContact: ClientContact = {
      id: `cont-${Date.now()}`,
      name: contactName.trim(),
      title: contactTitle,
      email: contactEmail.toLowerCase().trim(),
      phone: maskPhone(contactPhone.trim()),
      role: contactRole.trim() || 'Comprador',
      lastUsed: new Date().toISOString()
    };

    const updated = companies.map(c => {
      if (c.id === targetCompId) {
        return {
          ...c,
          contacts: [...c.contacts, newContact]
        };
      }
      return c;
    });

    onSaveCompanies(updated);
    setSelectedCompanyId(targetCompId);
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setIsAddingContact(false);
  };

  // 4. EDITAR COMPRADOR EXISTENTE E ASSOCIAR / TRANSFERIR DE EMPRESA
  const handleStartEditContact = (contact: ClientContact) => {
    setEditingContact(contact);
    setEditContactName(contact.name);
    setEditContactTitle((contact.title as any) || 'Sr.');
    setEditContactEmail(contact.email || '');
    setEditContactPhone(contact.phone || '');
    setEditContactRole(contact.role || 'Comprador');
    setEditContactTargetCompanyId(selectedCompany?.id || companies[0]?.id || '');
  };

  const handleSaveEditContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact || !editContactName.trim() || !selectedCompany) return;

    const currentCompanyId = selectedCompany.id;
    const targetCompanyId = editContactTargetCompanyId || currentCompanyId;

    const updatedContact: ClientContact = {
      ...editingContact,
      name: editContactName.trim(),
      title: editContactTitle,
      email: editContactEmail.toLowerCase().trim(),
      phone: maskPhone(editContactPhone.trim()),
      role: editContactRole.trim() || 'Comprador',
      lastUsed: new Date().toISOString()
    };

    const updated = companies.map(c => {
      // Se moveu para outra empresa: remove da empresa anterior
      if (currentCompanyId !== targetCompanyId && c.id === currentCompanyId) {
        return {
          ...c,
          contacts: c.contacts.filter(ct => ct.id !== editingContact.id)
        };
      }
      // Na empresa de destino: atualiza ou insere o contato
      if (c.id === targetCompanyId) {
        const exists = c.contacts.some(ct => ct.id === editingContact.id);
        return {
          ...c,
          contacts: exists
            ? c.contacts.map(ct => ct.id === editingContact.id ? updatedContact : ct)
            : [...c.contacts, updatedContact]
        };
      }
      return c;
    });

    onSaveCompanies(updated);
    setSelectedCompanyId(targetCompanyId);
    setEditingContact(null);
  };

  const handleDeleteContact = (contactId: string) => {
    if (!selectedCompany) return;
    const updated = companies.map(c => {
      if (c.id === selectedCompany.id) {
        return {
          ...c,
          contacts: c.contacts.filter(ct => ct.id !== contactId)
        };
      }
      return c;
    });
    onSaveCompanies(updated);
    if (onDeleteContact) {
      onDeleteContact(contactId, selectedCompany.id);
    }
    setContactIdToDelete(null);
  };

  const handleDeleteCompany = (companyId: string) => {
    const updated = companies.filter(c => c.id !== companyId);
    onSaveCompanies(updated);
    if (onDeleteCompany) {
      onDeleteCompany(companyId);
    }
    if (selectedCompanyId === companyId) {
      const remaining = updated.find(c => c.id !== companyId);
      setSelectedCompanyId(remaining?.id || '');
    }
    setCompanyIdToDelete(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Agenda de Empresas & Compradores</h2>
              <p className="text-xs text-slate-500">Edite empresas, compradores e vincule quem pertence a qual empresa com 1 clique</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenEmailScanner && (
              <button
                type="button"
                onClick={onOpenEmailScanner}
                className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Varrer os últimos e-mails para descobrir novos compradores e empresas não cadastrados"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span>Varrer E-mails</span>
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-0">
          
          {/* Left Column: Companies List (4 cols) */}
          <div className="md:col-span-4 border-r border-slate-200 flex flex-col bg-slate-50/40 p-4 space-y-3 overflow-y-auto">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar empresa ou comprador..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>

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

            {/* Form de Nova Empresa */}
            {isAddingCompany && (
              <form onSubmit={handleCreateCompany} className="bg-white p-3 rounded-xl border border-sky-300 shadow-xs space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800">Cadastrar Empresa</span>
                  <button type="button" onClick={() => setIsAddingCompany(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Nome da empresa (ex: UBEC ou CNC)..."
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-medium"
                  autoFocus
                  required
                />
                <input
                  type="text"
                  placeholder="Local de entrega (Ex: Brasília - DF)"
                  value={newCompanyLocation}
                  onChange={(e) => setNewCompanyLocation(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500"
                />
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingCompany(false)}
                    className="text-xs px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="text-xs px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-2xs"
                  >
                    Salvar Empresa
                  </button>
                </div>
              </form>
            )}

            {/* Lista de Empresas */}
            <div className="space-y-1.5 flex-1 overflow-y-auto pr-0.5">
              {filteredCompanies.map(comp => {
                const isSelected = selectedCompany?.id === comp.id;
                return (
                  <div
                    key={comp.id}
                    onClick={() => {
                      setSelectedCompanyId(comp.id);
                      setIsEditingCompany(false);
                      setEditingContact(null);
                    }}
                    className={`p-3 rounded-xl cursor-pointer border transition text-left space-y-1 ${
                      isSelected
                        ? 'bg-sky-50/90 border-sky-400 shadow-xs'
                        : 'bg-white hover:bg-slate-100 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <p className={`text-xs font-bold leading-snug line-clamp-2 ${isSelected ? 'text-sky-900' : 'text-slate-800'}`}>
                        {comp.name}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {comp.contacts.length} {comp.contacts.length === 1 ? 'comp.' : 'comp.'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCompanyId(comp.id);
                            setCompanyIdToDelete(comp.id);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Excluir esta empresa"
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
                <div className="text-center py-8 text-slate-400 text-xs">
                  Nenhuma empresa encontrada.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Company Details & Buyers (8 cols) */}
          <div className="md:col-span-8 flex flex-col p-6 overflow-y-auto space-y-5">
            {selectedCompany ? (
              <>
                {/* Company Header & Edit Form */}
                <div className="pb-4 border-b border-slate-200">
                  {isEditingCompany ? (
                    <form onSubmit={handleSaveEditCompany} className="bg-sky-50/70 border border-sky-300 rounded-xl p-4 shadow-xs space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                          Editar Dados da Empresa
                        </span>
                        <button 
                          type="button" 
                          onClick={() => setIsEditingCompany(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome da Empresa / Órgão</label>
                          <input
                            type="text"
                            required
                            value={editCompanyName}
                            onChange={(e) => setEditCompanyName(e.target.value)}
                            className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Local de Entrega Padrão</label>
                          <input
                            type="text"
                            value={editCompanyLocation}
                            onChange={(e) => setEditCompanyLocation(e.target.value)}
                            className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsEditingCompany(false)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Alterações</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 uppercase tracking-wider">
                            Empresa Selecionada
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 leading-tight">
                          {selectedCompany.name}
                        </h3>
                        {selectedCompany.defaultDeliveryLocation && (
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-sky-600" />
                            <span>Entrega padrão: {selectedCompany.defaultDeliveryLocation}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleStartEditCompany}
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
                          title="Editar nome da empresa ou local de entrega"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                          <span>Editar Empresa</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleStartAddContact}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Novo Comprador</span>
                        </button>
                        {companyIdToDelete === selectedCompany.id ? (
                          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl animate-in fade-in">
                            <span className="text-[11px] font-bold text-red-700">Excluir empresa?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCompany(selectedCompany.id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
                            >
                              Sim, excluir
                            </button>
                            <button
                              type="button"
                              onClick={() => setCompanyIdToDelete(null)}
                              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCompanyIdToDelete(selectedCompany.id)}
                            className="px-2.5 py-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl transition flex items-center gap-1 text-xs font-semibold"
                            title="Excluir Empresa"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                            <span className="text-red-600 hidden sm:inline">Excluir</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Gestão de Múltiplas Localidades de Frete da Empresa */}
                <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-sky-600" />
                      <h4 className="text-xs font-bold text-slate-800">
                        Localidades de Entrega / Frete ({selectedCompany.locations?.length || 1})
                      </h4>
                    </div>
                    <span className="text-[10.5px] text-slate-400">
                      Cidades e destinos para onde o frete pode ser cotado (ex: Brasília, Coronel Fabriciano, Joinville)
                    </span>
                  </div>

                  {/* Lista de tags/pills das localidades */}
                  <div className="flex flex-wrap gap-2">
                    {(selectedCompany.locations && selectedCompany.locations.length > 0
                      ? selectedCompany.locations
                      : [selectedCompany.defaultDeliveryLocation || 'Brasília']
                    ).map(loc => {
                      const isDefault = selectedCompany.defaultDeliveryLocation === loc;
                      return (
                        <div
                          key={loc}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition ${
                            isDefault 
                              ? 'bg-sky-50 border-sky-300 text-sky-950 font-semibold shadow-2xs ring-1 ring-sky-200' 
                              : 'bg-white border-slate-200 text-slate-700 hover:border-sky-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSetDefaultLocation(selectedCompany.id, loc)}
                            className={`transition ${isDefault ? 'text-amber-500 font-bold' : 'text-slate-300 hover:text-amber-500'}`}
                            title={isDefault ? 'Destino padrão de entrega do frete' : 'Clique para tornar esta a cidade padrão do frete'}
                          >
                            ★
                          </button>
                          <span>{loc}</span>
                          {isDefault && (
                            <span className="text-[9.5px] px-1.5 py-0.5 bg-sky-600 text-white rounded font-bold uppercase tracking-wider">
                              Padrão
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveLocationFromCompany(selectedCompany.id, loc)}
                            className="text-slate-400 hover:text-red-500 ml-1 p-0.5"
                            title="Remover localidade"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Formulário rápido para adicionar nova localidade de frete */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddLocationToCompany(selectedCompany.id, newLocationName);
                    }}
                    className="flex items-center gap-2 pt-1"
                  >
                    <input
                      type="text"
                      value={newLocationName}
                      onChange={(e) => setNewLocationName(e.target.value)}
                      placeholder="Adicionar cidade/destino de frete (ex: Coronel Fabriciano, Joinville, Brasília)..."
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      disabled={!newLocationName.trim()}
                      className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 shrink-0 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Localidade</span>
                    </button>
                  </form>
                </div>

                {/* Form de Edição de Comprador Existente (com seleção de Empresa Pertencente) */}
                {editingContact && (
                  <form onSubmit={handleSaveEditContact} className="bg-amber-50/60 border border-amber-300 rounded-xl p-4 shadow-xs space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between pb-1 border-b border-amber-200">
                      <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                        <span>Editar Comprador: <strong>{editingContact.name}</strong></span>
                      </h4>
                      <button 
                        type="button" 
                        onClick={() => setEditingContact(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome do Comprador</label>
                        <div className="flex gap-1.5">
                          <select
                            value={editContactTitle}
                            onChange={(e) => setEditContactTitle(e.target.value as any)}
                            className="text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                          >
                            <option value="Sr.">Sr.</option>
                            <option value="Srta.">Srta.</option>
                            <option value="Sra.">Sra.</option>
                            <option value="Dr.">Dr.</option>
                            <option value="Dra.">Dra.</option>
                          </select>
                          <input
                            type="text"
                            required
                            value={editContactName}
                            onChange={(e) => setEditContactName(e.target.value)}
                            className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-bold text-slate-900"
                          />
                        </div>
                      </div>

                      {/* Dropdown decisivo: "Dizer que o comprador tal pertence à empresa tal" */}
                      <div>
                        <label className="block text-[11px] font-bold text-sky-800 mb-1 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-sky-600" />
                          <span>Empresa que este Comprador Pertence</span>
                        </label>
                        <select
                          value={editContactTargetCompanyId}
                          onChange={(e) => setEditContactTargetCompanyId(e.target.value)}
                          className="w-full text-xs px-3 py-1.5 bg-white border-2 border-sky-300 rounded-lg font-bold text-sky-900 focus:outline-none focus:border-sky-600 shadow-2xs cursor-pointer"
                        >
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.id === selectedCompany.id ? '(Atual)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cargo / Função</label>
                        <input
                          type="text"
                          value={editContactRole}
                          onChange={(e) => setEditContactRole(e.target.value)}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">E-mail</label>
                        <input
                          type="email"
                          required
                          value={editContactEmail}
                          onChange={(e) => setEditContactEmail(e.target.value.toLowerCase())}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-slate-900 lowercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input
                          type="text"
                          placeholder="Ex: (61) 3403-2944"
                          maxLength={15}
                          value={maskPhone(editContactPhone)}
                          onChange={(e) => setEditContactPhone(maskPhone(e.target.value))}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingContact(null)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar Comprador e Vínculo</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Form de Novo Comprador (com opção de escolher a empresa que pertence) */}
                {isAddingContact && (
                  <form onSubmit={handleCreateContact} className="bg-sky-50/50 border border-sky-300 rounded-xl p-4 shadow-xs space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between pb-1 border-b border-sky-200">
                      <h4 className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-sky-600" />
                        <span>Novo Comprador</span>
                      </h4>
                      <button 
                        type="button" 
                        onClick={() => setIsAddingContact(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome Completo</label>
                        <div className="flex gap-1.5">
                          <select
                            value={contactTitle}
                            onChange={(e) => setContactTitle(e.target.value as any)}
                            className="text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:border-sky-500"
                          >
                            <option value="Sr.">Sr.</option>
                            <option value="Srta.">Srta.</option>
                            <option value="Sra.">Sra.</option>
                            <option value="Dr.">Dr.</option>
                            <option value="Dra.">Dra.</option>
                          </select>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Alex Pereira da Silva"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-bold text-slate-900"
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* Dropdown: Pertence à Empresa */}
                      <div>
                        <label className="block text-[11px] font-bold text-sky-800 mb-1 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-sky-600" />
                          <span>Pertence à Empresa:</span>
                        </label>
                        <select
                          value={contactCompanyId}
                          onChange={(e) => setContactCompanyId(e.target.value)}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:outline-none focus:border-sky-500 cursor-pointer"
                        >
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cargo / Departamento</label>
                        <input
                          type="text"
                          placeholder="Ex: Comprador TI / Suprimentos"
                          value={contactRole}
                          onChange={(e) => setContactRole(e.target.value)}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">E-mail</label>
                        <input
                          type="email"
                          required
                          placeholder="Ex: alex@empresa.com.br"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value.toLowerCase())}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900 lowercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input
                          type="text"
                          placeholder="Ex: (61) 3403-2944"
                          maxLength={15}
                          value={maskPhone(contactPhone)}
                          onChange={(e) => setContactPhone(maskPhone(e.target.value))}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingContact(false)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-2xs"
                      >
                        Salvar Comprador
                      </button>
                    </div>
                  </form>
                )}

                {/* Lista de Compradores Cadastrados na Empresa Selecionada */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Compradores da {selectedCompany.name.split('—')[0].split('-')[0].trim()} ({selectedCompany.contacts.length})</span>
                  </h4>

                  <div className="grid grid-cols-1 gap-2.5">
                    {selectedCompany.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-sky-300 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {contact.title || 'Sr(a).'} {contact.name}
                            </span>
                            {contact.role && (
                              <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                {contact.role}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            {contact.email && (
                              <span className="flex items-center gap-1 text-sky-700">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {contact.email}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1 text-slate-700 font-medium">
                                <Phone className="w-3 h-3 text-emerald-600" />
                                {contact.phone}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                          {onSelectBuyerForQuote && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectBuyerForQuote(selectedCompany.name, contact);
                                onClose();
                              }}
                              className="px-2.5 py-1.5 bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1"
                              title="Inserir este comprador e empresa na proposta atual"
                            >
                              <Check className="w-3.5 h-3.5 text-sky-600" />
                              <span>Usar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleStartEditContact(contact)}
                            className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                            title="Editar dados e empresa vinculada deste comprador"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                            <span>Editar / Vincular</span>
                          </button>

                          {contactIdToDelete === contact.id ? (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 px-2 py-1 rounded-lg animate-in fade-in">
                              <span className="text-[10.5px] font-bold text-red-700">Excluir?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteContact(contact.id)}
                                className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10.5px] font-bold shadow-xs transition"
                              >
                                Sim
                              </button>
                              <button
                                type="button"
                                onClick={() => setContactIdToDelete(null)}
                                className="px-1.5 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10.5px] font-semibold transition"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setContactIdToDelete(contact.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Remover Comprador"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {selectedCompany.contacts.length === 0 && (
                      <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Nenhum comprador cadastrado para esta empresa ainda. Clique no botão "Novo Comprador" acima para adicionar.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-slate-400 text-xs">
                Selecione uma empresa na lista ao lado para ver e cadastrar compradores.
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
