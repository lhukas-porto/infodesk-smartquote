import React, { useState } from 'react';
import { 
  Search, 
  Sparkles, 
  Building, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  Check, 
  X, 
  Save, 
  CheckCheck, 
  AlertCircle,
  Loader2,
  Trash2
} from 'lucide-react';
import { ClientCompany, IncomingEmail } from '../types';
import { 
  scanEmailsForNewClients, 
  ScannedContactCandidate 
} from '../services/emailScannerService';

interface EmailContactScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCompanies: ClientCompany[];
  localEmails: IncomingEmail[];
  accessToken?: string | null;
  onSaveCandidate: (candidate: ScannedContactCandidate) => Promise<void> | void;
  onSaveAllCandidates: (candidates: ScannedContactCandidate[]) => Promise<void> | void;
}

export const EmailContactScannerModal: React.FC<EmailContactScannerModalProps> = ({
  isOpen,
  onClose,
  existingCompanies,
  localEmails,
  accessToken,
  onSaveCandidate,
  onSaveAllCandidates
}) => {
  const [emailCount, setEmailCount] = useState<number>(25);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [candidates, setCandidates] = useState<ScannedContactCandidate[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);

  if (!isOpen) return null;

  const handleStartScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanStatusMsg('Iniciando varredura...');
    setCandidates([]);
    setSavedIds(new Set());

    try {
      const results = await scanEmailsForNewClients({
        count: emailCount,
        existingCompanies,
        accessToken,
        localEmails,
        onProgress: (pct, msg) => {
          setScanProgress(pct);
          setScanStatusMsg(msg);
        }
      });
      setCandidates(results);
      setHasScanned(true);
    } catch (err: any) {
      console.error('Erro na varredura de e-mails:', err);
      alert(`Falha na varredura: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleUpdateCandidateField = (id: string, field: keyof ScannedContactCandidate, value: any) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleSaveSingle = async (candidate: ScannedContactCandidate) => {
    try {
      await onSaveCandidate(candidate);
      setSavedIds(prev => new Set(prev).add(candidate.id));
    } catch (err) {
      console.error('Erro ao salvar candidato:', err);
    }
  };

  const handleDiscardSingle = (id: string) => {
    setCandidates(prev => prev.filter(c => c.id !== id));
  };

  const handleSaveAll = async () => {
    const unsaved = candidates.filter(c => !savedIds.has(c.id));
    if (unsaved.length === 0) return;

    setIsSavingAll(true);
    try {
      await onSaveAllCandidates(unsaved);
      const allIds = new Set(candidates.map(c => c.id));
      setSavedIds(allIds);
    } catch (err) {
      console.error('Erro ao salvar em lote:', err);
    } finally {
      setIsSavingAll(false);
    }
  };

  const unsavedCandidates = candidates.filter(c => !savedIds.has(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-100 text-sky-700 rounded-xl shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Varredura de E-mails para Novos Compradores</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  Filtro Anti-Duplicação Ativo
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Minera os últimos e-mails, detecta novos contatos e oculta qualquer empresa ou comprador já cadastrado na Agenda.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="p-6 bg-slate-50/60 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Analisar últimos:</span>
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                {[10, 25, 50, 100].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setEmailCount(val)}
                    disabled={isScanning}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      emailCount === val
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 font-medium">e-mails</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                {accessToken ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <strong className="text-emerald-700">Gmail Conectado</strong>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    <strong className="text-sky-700">E-mails Locais ({localEmails.length})</strong>
                  </>
                )}
              </span>

              <button
                type="button"
                onClick={handleStartScan}
                disabled={isScanning}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analisando ({scanProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Iniciar Varredura</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* Progress Bar */}
          {isScanning && (
            <div className="space-y-1.5 animate-in fade-in">
              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                <span>{scanStatusMsg}</span>
                <span>{scanProgress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-sky-600 transition-all duration-300 rounded-full"
                  style={{ width: `${scanProgress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {!hasScanned && !isScanning && (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Pronto para varrer seus e-mails</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Escolha a quantidade de e-mails acima e clique em <strong>"Iniciar Varredura"</strong>.
                O sistema fará uma checagem cruzada com todos os contatos já cadastrados e mostrará 
                apenas <strong>novos compradores e empresas</strong> prontos para salvar.
              </p>
            </div>
          )}

          {hasScanned && candidates.length === 0 && !isScanning && (
            <div className="text-center py-16 px-4 space-y-3 bg-slate-50/70 rounded-2xl border border-slate-200">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                <CheckCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Tudo Atualizado!</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Nenhum novo comprador ou empresa pendente foi detectado nos últimos {emailCount} e-mails.
                Todos os contatos encontrados já estão devidamente cadastrados na sua Agenda.
              </p>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="space-y-4">
              
              {/* Summary Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    {unsavedCandidates.length} {unsavedCandidates.length === 1 ? 'novo contato pendente' : 'novos contatos pendentes'}
                  </span>
                  {savedIds.size > 0 && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      ✓ {savedIds.size} já salvos
                    </span>
                  )}
                </div>

                {unsavedCandidates.length > 1 && (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={isSavingAll}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Salvar Todos ({unsavedCandidates.length}) na Agenda</span>
                  </button>
                )}
              </div>

              {/* Cards Grid */}
              <div className="space-y-3">
                {candidates.map((c) => {
                  const isSaved = savedIds.has(c.id);

                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-2xl border transition space-y-3 ${
                        isSaved
                          ? 'bg-emerald-50/40 border-emerald-200 opacity-80'
                          : 'bg-white border-slate-200 shadow-2xs hover:border-sky-300'
                      }`}
                    >
                      {/* Top Bar: Subject & Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <span className="text-[11px] font-semibold text-slate-500 truncate max-w-xl">
                          ✉ E-mail: <strong>{c.subject}</strong> ({c.date})
                        </span>

                        <div className="flex items-center gap-1.5">
                          {isSaved ? (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>Salvo na Agenda</span>
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveSingle(c)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Salvar na Agenda</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDiscardSingle(c.id)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Ignorar este contato"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Form Inputs (Editable before saving) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        
                        {/* Empresa */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[10.5px] font-bold text-slate-600 flex items-center gap-1">
                              <Building className="w-3 h-3 text-sky-600" />
                              <span>Empresa / Instituição</span>
                            </label>
                            {existingCompanies.length > 0 && (
                              <span className="text-[9.5px] text-slate-400 font-medium">
                                ou selecione abaixo:
                              </span>
                            )}
                          </div>

                          <input
                            type="text"
                            list={`registered-companies-list-${c.id}`}
                            value={c.companyName}
                            onChange={(e) => handleUpdateCandidateField(c.id, 'companyName', e.target.value)}
                            placeholder="Ex: UBEC ou Casa Shopping"
                            disabled={isSaved}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:outline-none focus:border-sky-500 disabled:bg-slate-100 mb-1"
                          />

                          <datalist id={`registered-companies-list-${c.id}`}>
                            {existingCompanies.map(comp => (
                              <option key={comp.id} value={comp.name} />
                            ))}
                          </datalist>

                          {existingCompanies.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                const selectedName = e.target.value;
                                if (selectedName) {
                                  handleUpdateCandidateField(c.id, 'companyName', selectedName);
                                  const foundComp = existingCompanies.find(comp => comp.name === selectedName);
                                  if (foundComp?.defaultDeliveryLocation && !c.deliveryLocation) {
                                    handleUpdateCandidateField(c.id, 'deliveryLocation', foundComp.defaultDeliveryLocation);
                                  }
                                }
                              }}
                              disabled={isSaved}
                              className="w-full text-[11px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:border-sky-500 cursor-pointer"
                            >
                              <option value="">🏢 Vincular a uma empresa cadastrada...</option>
                              {existingCompanies.map(comp => (
                                <option key={comp.id} value={comp.name}>
                                  {comp.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Comprador com título */}
                        <div>
                          <label className="block text-[10.5px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                            <User className="w-3 h-3 text-sky-600" />
                            <span>Nome do Comprador</span>
                          </label>
                          <div className="flex gap-1">
                            <select
                              value={c.title}
                              onChange={(e) => handleUpdateCandidateField(c.id, 'title', e.target.value as any)}
                              disabled={isSaved}
                              className="text-xs px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-700 focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
                            >
                              <option value="Sr.">Sr.</option>
                              <option value="Srta.">Srta.</option>
                              <option value="Sra.">Sra.</option>
                              <option value="Dr.">Dr.</option>
                              <option value="Dra.">Dra.</option>
                            </select>
                            <input
                              type="text"
                              value={c.contactName}
                              onChange={(e) => handleUpdateCandidateField(c.id, 'contactName', e.target.value)}
                              placeholder="Nome do contato..."
                              disabled={isSaved}
                              className="flex-1 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
                            />
                          </div>
                        </div>

                        {/* E-mail */}
                        <div>
                          <label className="block text-[10.5px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>E-mail do Comprador</span>
                          </label>
                          <input
                            type="email"
                            value={c.email}
                            onChange={(e) => handleUpdateCandidateField(c.id, 'email', e.target.value.toLowerCase())}
                            placeholder="email@empresa.com.br"
                            disabled={isSaved}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:border-sky-500 lowercase disabled:bg-slate-100"
                          />
                        </div>

                        {/* Telefone */}
                        <div>
                          <label className="block text-[10.5px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>Telefone / WhatsApp</span>
                          </label>
                          <input
                            type="text"
                            value={c.phone}
                            onChange={(e) => handleUpdateCandidateField(c.id, 'phone', e.target.value)}
                            placeholder="(61) 99999-9999"
                            disabled={isSaved}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
                          />
                        </div>

                        {/* Localidade de Frete */}
                        <div>
                          <label className="block text-[10.5px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-red-500" />
                            <span>Localidade de Frete / Entrega</span>
                          </label>
                          <input
                            type="text"
                            value={c.deliveryLocation}
                            onChange={(e) => handleUpdateCandidateField(c.id, 'deliveryLocation', e.target.value)}
                            placeholder="Ex: Brasília - DF"
                            disabled={isSaved}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
                          />
                        </div>

                        {/* Cargo / Departamento */}
                        <div>
                          <label className="block text-[10.5px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-slate-400" />
                            <span>Cargo / Departamento</span>
                          </label>
                          <input
                            type="text"
                            value={c.role}
                            onChange={(e) => handleUpdateCandidateField(c.id, 'role', e.target.value)}
                            placeholder="Ex: Comprador TI"
                            disabled={isSaved}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
                          />
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            {candidates.length > 0 
              ? `${candidates.length} contatos minerados dos últimos ${emailCount} e-mails`
              : 'O sistema apenas lista contatos e empresas que não constam na sua base.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl font-bold text-slate-700 shadow-2xs transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
