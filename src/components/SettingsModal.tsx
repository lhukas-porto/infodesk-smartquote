import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Building, 
  Check, 
  Mail, 
  Save,
  Calculator,
  Sparkles,
  Layers,
  Tag,
  Box,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  X,
  Search
} from 'lucide-react';
import { CompanySettings } from '../types';
import { 
  saveSettings, 
  getRegisteredUnits, 
  getRegisteredCategories,
  saveRegisteredUnit,
  updateRegisteredUnit,
  deleteRegisteredUnit,
  resetRegisteredUnits,
  saveRegisteredCategory,
  updateRegisteredCategory,
  deleteRegisteredCategory,
  resetRegisteredCategories,
  saveRegisteredCategoriesList,
  saveRegisteredUnitsList
} from '../utils/storage';
import { getStoredGeminiKey, saveStoredGeminiKey, getStoredSerpApiKey, saveStoredSerpApiKey } from '../services/priceScannerService';
import { maskPhone } from '../utils/aiEmailParser';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CompanySettings;
  onSaveSettings: (newSettings: CompanySettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'catalog'>('general');
  const [form, setForm] = useState<CompanySettings>(settings);
  const [markupInput, setMarkupInput] = useState<string>('');
  const [taxInput, setTaxInput] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [geminiKey, setGeminiKey] = useState(getStoredGeminiKey());
  const [serpApiKey, setSerpApiKey] = useState(getStoredSerpApiKey());
  const [isSaving, setIsSaving] = useState(false);
  const prevIsOpenRef = React.useRef(false);

  // Estados de Categorias e Unidades
  const [categories, setCategories] = useState<string[]>(() => getRegisteredCategories());
  const [units, setUnits] = useState<string[]>(() => getRegisteredUnits());
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [newUnitInput, setNewUnitInput] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [searchUnit, setSearchUnit] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryVal, setEditCategoryVal] = useState('');
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [editUnitVal, setEditUnitVal] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 2800);
  };

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setForm(settings);
      setMarkupInput(settings.defaultMarkupPercent !== undefined ? String(settings.defaultMarkupPercent).replace('.', ',') : '23,5');
      setTaxInput(settings.defaultTaxPercent !== undefined ? String(settings.defaultTaxPercent).replace('.', ',') : '9,1');
      setGeminiKey(getStoredGeminiKey());
      setSerpApiKey(getStoredSerpApiKey());
      setCategories(getRegisteredCategories());
      setUnits(getRegisteredUnits());
      setEditingCategory(null);
      setEditingUnit(null);
      setNewCategoryInput('');
      setNewUnitInput('');
    }
    prevIsOpenRef.current = isOpen;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    const handleMetaChanged = () => {
      setCategories(getRegisteredCategories());
      setUnits(getRegisteredUnits());
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('infodesk_metadata_changed', handleMetaChanged);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('infodesk_metadata_changed', handleMetaChanged);
    };
  }, [isOpen, settings, onClose]);

  if (!isOpen) return null;

  // Handlers de Categorias
  const handleAddCategory = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newCategoryInput.trim();
    if (!clean) return;
    if (categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      showFeedback('Esta categoria já está cadastrada.');
      return;
    }
    const updated = saveRegisteredCategory(clean);
    setCategories(updated);
    setNewCategoryInput('');
    showFeedback(`Categoria "${clean}" adicionada com sucesso!`);
  };

  const handleStartEditCategory = (cat: string) => {
    setEditingCategory(cat);
    setEditCategoryVal(cat);
  };

  const handleSaveEditCategory = (oldCat: string) => {
    const cleanNew = editCategoryVal.trim();
    if (!cleanNew || cleanNew.toLowerCase() === oldCat.toLowerCase()) {
      setEditingCategory(null);
      return;
    }
    const updated = updateRegisteredCategory(oldCat, cleanNew);
    setCategories(updated);
    setEditingCategory(null);
    showFeedback(`Categoria renomeada para "${cleanNew}".`);
  };

  const handleDeleteCategory = (cat: string) => {
    const updated = deleteRegisteredCategory(cat);
    setCategories(updated);
    if (editingCategory === cat) setEditingCategory(null);
    showFeedback(`Categoria "${cat}" removida.`);
  };

  const handleResetCategories = () => {
    if (window.confirm('Tem certeza que deseja restaurar as categorias padrão do sistema? Suas categorias personalizadas serão redefinidas.')) {
      const updated = resetRegisteredCategories();
      setCategories(updated);
      showFeedback('Categorias padrão restauradas com sucesso!');
    }
  };

  // Handlers de Unidades
  const handleAddUnit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newUnitInput.trim();
    if (!clean) return;
    if (units.some(u => u.toLowerCase() === clean.toLowerCase())) {
      showFeedback('Esta unidade de medida já está cadastrada.');
      return;
    }
    const updated = saveRegisteredUnit(clean);
    setUnits(updated);
    setNewUnitInput('');
    showFeedback(`Unidade "${clean}" adicionada com sucesso!`);
  };

  const handleStartEditUnit = (unit: string) => {
    setEditingUnit(unit);
    setEditUnitVal(unit);
  };

  const handleSaveEditUnit = (oldUnit: string) => {
    const cleanNew = editUnitVal.trim();
    if (!cleanNew || cleanNew.toLowerCase() === oldUnit.toLowerCase()) {
      setEditingUnit(null);
      return;
    }
    const updated = updateRegisteredUnit(oldUnit, cleanNew);
    setUnits(updated);
    setEditingUnit(null);
    showFeedback(`Unidade renomeada para "${cleanNew}".`);
  };

  const handleDeleteUnit = (unit: string) => {
    const updated = deleteRegisteredUnit(unit);
    setUnits(updated);
    if (editingUnit === unit) setEditingUnit(null);
    showFeedback(`Unidade "${unit}" removida.`);
  };

  const handleResetUnits = () => {
    if (window.confirm('Tem certeza que deseja restaurar as unidades de medida padrão? Suas unidades personalizadas serão redefinidas.')) {
      const updated = resetRegisteredUnits();
      setUnits(updated);
      showFeedback('Unidades de medida padrão restauradas com sucesso!');
    }
  };

  const sortedCategories = React.useMemo(() => {
    return [...categories].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [categories]);

  const sortedUnits = React.useMemo(() => {
    return [...units].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [units]);

  const filteredCategories = sortedCategories.filter(c => 
    c.toLowerCase().includes(searchCategory.toLowerCase())
  );

  const filteredUnits = sortedUnits.filter(u => 
    u.toLowerCase().includes(searchUnit.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const cleanMarkup = markupInput.replace('%', '').trim().replace(',', '.');
    const cleanTax = taxInput.replace('%', '').trim().replace(',', '.');

    const parsedMarkup = parseFloat(cleanMarkup);
    const parsedTax = parseFloat(cleanTax);

    const updatedForm: CompanySettings = {
      ...form,
      id: settings.id || form.id,
      defaultMarkupPercent: !isNaN(parsedMarkup) && parsedMarkup >= 0 ? parsedMarkup : (form.defaultMarkupPercent ?? 23.5),
      defaultTaxPercent: !isNaN(parsedTax) && parsedTax >= 0 ? parsedTax : (form.defaultTaxPercent ?? 9.1),
      defaultShippingCost: 0
    };

    saveSettings(updatedForm);
    saveStoredGeminiKey(geminiKey);
    saveStoredSerpApiKey(serpApiKey);
    saveRegisteredCategoriesList(categories);
    saveRegisteredUnitsList(units);
    try {
      if (onSaveSettings) {
        await onSaveSettings(updatedForm);
      }
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 800);
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scaleIn">
        
        {/* Cabeçalho do Modal */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-sky-600 shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Configurações da Infodesk</h2>
              <p className="text-xs text-slate-500">Personalize dados cadastrais, impostos, conexões, categorias e unidades</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex border-b border-slate-200 bg-white px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition cursor-pointer ${
              activeTab === 'general'
                ? 'border-sky-600 text-sky-700 bg-sky-50/60 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
            }`}
          >
            <Building className="w-4 h-4 text-sky-600" />
            <span>Empresa, Impostos & Conexões</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition cursor-pointer ${
              activeTab === 'catalog'
                ? 'border-sky-600 text-sky-700 bg-sky-50/60 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
            }`}
          >
            <Layers className="w-4 h-4 text-sky-600" />
            <span>Categorias & Unidades</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
              {categories.length + units.length}
            </span>
          </button>
        </div>

        {/* Toast de Feedback */}
        {feedbackMessage && (
          <div className="mx-6 mt-3 px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600" />
              {feedbackMessage}
            </span>
            <button 
              onClick={() => setFeedbackMessage(null)}
              className="text-emerald-600 hover:text-emerald-900 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Conteúdo da Aba Geral */}
        {activeTab === 'general' ? (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
            
            <h3 className="font-bold text-sky-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <Building className="w-3.5 h-3.5" /> Dados Cadastrais da Empresa
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Razão Social</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={form.tradeName}
                  onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">CNPJ</label>
                <input
                  type="text"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Inscrição Estadual (I.E.)</label>
                <input
                  type="text"
                  value={form.stateRegistration}
                  onChange={(e) => setForm({ ...form, stateRegistration: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-slate-600 font-medium mb-1">Endereço Comercial</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Cidade – UF</label>
                <input
                  type="text"
                  value={form.cityState}
                  onChange={(e) => setForm({ ...form, cityState: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Responsável</label>
                <input
                  type="text"
                  value={form.representativeName}
                  onChange={(e) => setForm({ ...form, representativeName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Telefone Fixo</label>
                <input
                  type="text"
                  placeholder="(61) 3403-2944"
                  maxLength={15}
                  value={maskPhone(form.phone)}
                  onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">WhatsApp</label>
                <input
                  type="text"
                  placeholder="(61) 99627-2630"
                  maxLength={15}
                  value={maskPhone(form.whatsapp)}
                  onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <h3 className="font-bold text-sky-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-200 pb-1 pt-3">
              <Calculator className="w-3.5 h-3.5" /> Parâmetros de Composição de Preço
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Margem de Lucro Padrão (%)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={markupInput}
                    onChange={(e) => {
                      setMarkupInput(e.target.value);
                      const clean = e.target.value.replace('%', '').trim().replace(',', '.');
                      const parsed = parseFloat(clean);
                      if (!isNaN(parsed) && parsed >= 0) {
                        setForm(prev => ({ ...prev, defaultMarkupPercent: parsed }));
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3 pr-7 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-semibold"
                  />
                  <span className="absolute right-2.5 top-2 text-xs text-slate-400">%</span>
                </div>
                <span className="text-[10px] text-slate-400">Margem líquida desejada</span>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Alíquota de Imposto Padrão (%)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={taxInput}
                    onChange={(e) => {
                      setTaxInput(e.target.value);
                      const clean = e.target.value.replace('%', '').trim().replace(',', '.');
                      const parsed = parseFloat(clean);
                      if (!isNaN(parsed) && parsed >= 0) {
                        setForm(prev => ({ ...prev, defaultTaxPercent: parsed }));
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3 pr-7 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-semibold"
                  />
                  <span className="absolute right-2.5 top-2 text-xs text-slate-400">%</span>
                </div>
                <span className="text-[10px] text-slate-400">Ex: Simples Nacional 9,1%</span>
              </div>
            </div>

            <h3 className="font-bold text-sky-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-200 pb-1 pt-3">
              <Mail className="w-3.5 h-3.5" /> Integração Google Workspace
            </h3>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900 text-xs">Conta Conectada ao Gmail</p>
                <p className="text-slate-500 text-[11px]">{form.googleAccountEmail}</p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10px] flex items-center gap-1">
                <Check className="w-3 h-3" /> Sincronizado
              </span>
            </div>

            <h3 className="font-bold text-sky-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-200 pb-1 pt-3">
              <Sparkles className="w-3.5 h-3.5" /> Scanner de Preços Web (Google Gemini)
            </h3>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                  <span>Chave de API Gemini (Opcional - Grátis)</span>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:text-sky-700 underline text-[10px] font-normal"
                  >
                    Criar chave grátis no Google AI Studio ↗
                  </a>
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                💡 <strong>Pesquisas Ilimitadas:</strong> Permite ao Scanner de Preços pesquisar a web ao vivo com Google Search Grounding em tempo real. Se deixar em branco, o scanner utilizará a base inteligente e agregadores locais.
              </p>

              {/* Chave Google Shopping / SerpApi / ValueSerp */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                  <span>Chave Google Shopping API (SerpApi / ValueSerp)</span>
                  <div className="flex items-center gap-2">
                    <a 
                      href="https://serpapi.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sky-600 hover:text-sky-700 underline text-[10px] font-normal"
                    >
                      SerpApi (100 grátis) ↗
                    </a>
                    <span className="text-slate-300">|</span>
                    <a 
                      href="https://www.valueserp.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sky-600 hover:text-sky-700 underline text-[10px] font-normal"
                    >
                      ValueSerp (1.000 grátis) ↗
                    </a>
                  </div>
                </label>
                <input
                  type="password"
                  placeholder="Insira sua chave SerpApi ou ValueSerp..."
                  value={serpApiKey}
                  onChange={(e) => setSerpApiKey(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                  🛍️ <strong>Preços Reais & Patrocinados do Google Shopping:</strong> Extrai automaticamente o menor preço de custo real do carrossel do Google Shopping Brasil, vinculando a loja e o link direto do produto para comprar.
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Salvo com Sucesso!</span>
                  </>
                ) : isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Salvando no Banco...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Conteúdo da Aba Categorias & Unidades */
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            
            <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Gerenciador de Categorias & Unidades de Medida</h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  As opções cadastradas abaixo ficam disponíveis instantaneamente em todos os formulários do <strong>Gerador de Propostas</strong> e da <strong>Base de Produtos</strong>. Edições e exclusões são salvas em tempo real.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Painel: CATEGORIAS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col h-[460px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sky-50 text-sky-700 rounded-lg border border-sky-200">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Categorias de Produtos</h4>
                      <p className="text-[10px] text-slate-400">{categories.length} cadastradas</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetCategories}
                    title="Restaurar lista padrão original da Infodesk"
                    className="text-[10.5px] font-semibold text-slate-500 hover:text-sky-700 flex items-center gap-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restaurar Padrão
                  </button>
                </div>

                {/* Form Adicionar Nova Categoria */}
                <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Nova categoria..."
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={!newCategoryInput.trim()}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </button>
                </form>

                {/* Busca Rápida */}
                {categories.length > 5 && (
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filtrar categorias..."
                      value={searchCategory}
                      onChange={(e) => setSearchCategory(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                )}

                {/* Lista de Categorias com Rolagem */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {filteredCategories.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center p-4 text-slate-400 text-xs">
                      Nenhuma categoria encontrada.
                    </div>
                  ) : (
                    filteredCategories.map((cat) => {
                      const isEditing = editingCategory === cat;

                      return (
                        <div 
                          key={cat}
                          className={`flex items-center justify-between p-2 rounded-xl border transition ${
                            isEditing 
                              ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-300' 
                              : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80'
                          }`}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                              <input
                                type="text"
                                autoFocus
                                value={editCategoryVal}
                                onChange={(e) => setEditCategoryVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditCategory(cat);
                                  if (e.key === 'Escape') setEditingCategory(null);
                                }}
                                className="w-full bg-white border border-sky-400 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEditCategory(cat)}
                                title="Salvar alteração"
                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCategory(null)}
                                title="Cancelar"
                                className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="font-semibold text-slate-800 text-xs truncate max-w-[210px]">
                                {cat}
                              </span>
                              <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditCategory(cat)}
                                  title={`Editar nome da categoria "${cat}"`}
                                  className="p-1 hover:bg-white text-slate-500 hover:text-sky-600 rounded-lg transition border border-transparent hover:border-slate-200 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(cat)}
                                  title={`Excluir categoria "${cat}"`}
                                  className="p-1 hover:bg-white text-slate-400 hover:text-rose-600 rounded-lg transition border border-transparent hover:border-slate-200 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Painel: UNIDADES DE MEDIDA */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col h-[460px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sky-50 text-sky-700 rounded-lg border border-sky-200">
                      <Box className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Unidades de Medida</h4>
                      <p className="text-[10px] text-slate-400">{units.length} cadastradas</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetUnits}
                    title="Restaurar lista de unidades padrão original da Infodesk"
                    className="text-[10.5px] font-semibold text-slate-500 hover:text-sky-700 flex items-center gap-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restaurar Padrão
                  </button>
                </div>

                {/* Form Adicionar Nova Unidade */}
                <form onSubmit={handleAddUnit} className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Ex: Un., Cx., Pct., Metro..."
                    value={newUnitInput}
                    onChange={(e) => setNewUnitInput(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={!newUnitInput.trim()}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </button>
                </form>

                {/* Busca Rápida */}
                {units.length > 5 && (
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filtrar unidades..."
                      value={searchUnit}
                      onChange={(e) => setSearchUnit(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>
                )}

                {/* Lista de Unidades com Rolagem */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {filteredUnits.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center p-4 text-slate-400 text-xs">
                      Nenhuma unidade encontrada.
                    </div>
                  ) : (
                    filteredUnits.map((u) => {
                      const isEditing = editingUnit === u;

                      return (
                        <div 
                          key={u}
                          className={`flex items-center justify-between p-2 rounded-xl border transition ${
                            isEditing 
                              ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-300' 
                              : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80'
                          }`}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                              <input
                                type="text"
                                autoFocus
                                value={editUnitVal}
                                onChange={(e) => setEditUnitVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditUnit(u);
                                  if (e.key === 'Escape') setEditingUnit(null);
                                }}
                                className="w-full bg-white border border-sky-400 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono font-bold focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEditUnit(u)}
                                title="Salvar alteração"
                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUnit(null)}
                                title="Cancelar"
                                className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="font-mono font-bold text-slate-900 text-xs bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                                {u}
                              </span>
                              <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditUnit(u)}
                                  title={`Editar unidade "${u}"`}
                                  className="p-1 hover:bg-white text-slate-500 hover:text-sky-600 rounded-lg transition border border-transparent hover:border-slate-200 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUnit(u)}
                                  title={`Excluir unidade "${u}"`}
                                  className="p-1 hover:bg-white text-slate-400 hover:text-rose-600 rounded-lg transition border border-transparent hover:border-slate-200 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* Rodapé da Aba de Categorias/Unidades */}
            <div className="pt-3 flex justify-end border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                Concluído
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

