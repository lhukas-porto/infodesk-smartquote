import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Building, 
  Check, 
  Mail, 
  Save,
  Calculator,
  Sparkles
} from 'lucide-react';
import { CompanySettings } from '../types';
import { saveSettings } from '../utils/storage';
import { getStoredGeminiKey, saveStoredGeminiKey } from '../services/priceScannerService';
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
  const [form, setForm] = useState<CompanySettings>(settings);
  const [markupInput, setMarkupInput] = useState<string>('');
  const [taxInput, setTaxInput] = useState<string>('');
  const [shippingInput, setShippingInput] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [geminiKey, setGeminiKey] = useState(getStoredGeminiKey());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(settings);
      setMarkupInput(settings.defaultMarkupPercent !== undefined ? String(settings.defaultMarkupPercent).replace('.', ',') : '23,5');
      setTaxInput(settings.defaultTaxPercent !== undefined ? String(settings.defaultTaxPercent).replace('.', ',') : '9,1');
      setShippingInput(settings.defaultShippingCost !== undefined ? String(settings.defaultShippingCost).replace('.', ',') : '0');
      setGeminiKey(getStoredGeminiKey());
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, settings, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const parsedMarkup = parseFloat(markupInput.replace(',', '.'));
    const parsedTax = parseFloat(taxInput.replace(',', '.'));
    const parsedShipping = parseFloat(shippingInput.replace(',', '.'));

    const updatedForm: CompanySettings = {
      ...form,
      defaultMarkupPercent: !isNaN(parsedMarkup) && parsedMarkup >= 0 ? parsedMarkup : (form.defaultMarkupPercent ?? 23.5),
      defaultTaxPercent: !isNaN(parsedTax) && parsedTax >= 0 ? parsedTax : (form.defaultTaxPercent ?? 9.1),
      defaultShippingCost: !isNaN(parsedShipping) && parsedShipping >= 0 ? parsedShipping : (form.defaultShippingCost ?? 0)
    };

    saveSettings(updatedForm);
    saveStoredGeminiKey(geminiKey);
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
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl animate-scaleIn">
        
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-sky-600">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Configurações da Infodesk</h2>
              <p className="text-xs text-slate-500">Personalize os dados cadastrais, termos comerciais e conexão Google Workspace</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition"
          >
            ✕
          </button>
        </div>

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
              <label className="block text-slate-600 font-medium mb-1">Responsável / Assinatura</label>
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
            <Calculator className="w-3.5 h-3.5" /> Parâmetros de Composição de Preço (Infodesk)
          </h3>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Margem de Lucro (% Markup)</label>
              <div className="relative">
                <input
                  type="text"
                  value={markupInput}
                  onChange={(e) => {
                    setMarkupInput(e.target.value);
                    const parsed = parseFloat(e.target.value.replace(',', '.'));
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
              <label className="block text-slate-600 font-medium mb-1">Alíquota de Imposto (%)</label>
              <div className="relative">
                <input
                  type="text"
                  value={taxInput}
                  onChange={(e) => {
                    setTaxInput(e.target.value);
                    const parsed = parseFloat(e.target.value.replace(',', '.'));
                    if (!isNaN(parsed) && parsed >= 0) {
                      setForm(prev => ({ ...prev, defaultTaxPercent: parsed }));
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3 pr-7 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-semibold"
                />
                <span className="absolute right-2.5 top-2 text-xs text-slate-400">%</span>
              </div>
              <span className="text-[10px] text-slate-400">Ex: Simples Nacional 6%</span>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Frete Padrão por Item (R$)</label>
              <div className="relative">
                <input
                  type="text"
                  value={shippingInput}
                  onChange={(e) => {
                    setShippingInput(e.target.value);
                    const parsed = parseFloat(e.target.value.replace(',', '.'));
                    if (!isNaN(parsed) && parsed >= 0) {
                      setForm(prev => ({ ...prev, defaultShippingCost: parsed }));
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-semibold font-mono"
                />
                <span className="absolute left-2.5 top-2 text-xs text-slate-400">R$</span>
              </div>
              <span className="text-[10px] text-slate-400">Custo médio de entrega</span>
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
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
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

      </div>
    </div>
  );
};
