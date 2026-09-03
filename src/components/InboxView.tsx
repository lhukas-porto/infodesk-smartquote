import React, { useState } from 'react';
import { 
  Mail, 
  Sparkles, 
  ArrowRight, 
  Building, 
  User, 
  Calendar, 
  RefreshCw, 
  Search, 
  FileEdit,
  Bot,
  LogOut,
  AlertCircle,
  Trash2,
  Plus,
  Phone,
  MapPin,
  Edit3,
  Save,
  Check,
  Users,
  X,
  Camera,
  Image as ImageIcon,
  Upload,
  FileText,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { IncomingEmail } from '../types';
import { EmailPeriodFilter } from '../services/gmailService';
import { registerOrUpdateClient } from '../utils/storage';
import { extractDataFromQuotationImage } from '../services/imageQuoteParser';

interface InboxViewProps {
  emails: IncomingEmail[];
  onSelectEmailToQuote: (email: IncomingEmail) => void;
  onParseCustomEmail: (rawText: string) => void;
  onAddCustomEmail?: (email: IncomingEmail) => void;
  onAddManualAnalysis?: (email: IncomingEmail) => void;
  isGoogleConnected?: boolean;
  connectedEmail?: string | null;
  isSyncing?: boolean;
  syncError?: string | null;
  currentPeriod?: EmailPeriodFilter;
  onConnectGoogle?: () => void;
  onDisconnectGoogle?: () => void;
  onRefreshEmails?: (period?: EmailPeriodFilter) => void;
  onOpenClientManagement?: () => void;
  onUpdateEmailDetails?: (emailId: string, updates: Partial<IncomingEmail>) => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  emails,
  onSelectEmailToQuote,
  onParseCustomEmail,
  onAddCustomEmail,
  onAddManualAnalysis,
  isGoogleConnected = false,
  connectedEmail = 'lucas@infodesk.com.br',
  isSyncing = false,
  syncError = null,
  currentPeriod = '7d',
  onConnectGoogle,
  onDisconnectGoogle,
  onRefreshEmails,
  onOpenClientManagement,
  onUpdateEmailDetails
}) => {
  const [selectedEmail, setSelectedEmail] = useState<IncomingEmail | null>(emails[0] || null);
  const [filterText, setFilterText] = useState('');
  const [customText, setCustomText] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customModeType, setCustomModeType] = useState<'image' | 'text'>('image');
  const [pastedImageFile, setPastedImageFile] = useState<File | null>(null);
  const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null);
  const [pastedImageDataUrl, setPastedImageDataUrl] = useState<string | null>(null);

  // Campos para criar o e-mail a partir da foto ou texto
  const [customSubject, setCustomSubject] = useState('');
  const [customSenderCompany, setCustomSenderCompany] = useState('');
  const [customSenderName, setCustomSenderName] = useState('');
  const [customSenderEmail, setCustomSenderEmail] = useState('');
  const [customSenderPhone, setCustomSenderPhone] = useState('');
  const [customDeliveryLocation, setCustomDeliveryLocation] = useState('Brasília - DF');

  const [emailViewMode, setEmailViewMode] = useState<'html' | 'text'>('html');
  const [editableItems, setEditableItems] = useState<IncomingEmail['suggestedItems']>([]);

  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractStatusMsg, setExtractStatusMsg] = useState('');
  const [extractedItemsForNewEmail, setExtractedItemsForNewEmail] = useState<any[]>([]);

  const handleImageSelected = (file: File) => {
    setPastedImageFile(file);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPastedImageDataUrl(dataUrl);
      setPastedImagePreview(dataUrl);
      const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
      if (!customSubject) {
        setCustomSubject(`Cotação via Foto / Print (${cleanFileName})`);
      }

      // Auto-extract items and metadata from photo in background
      setIsExtractingPhoto(true);
      setExtractProgress(20);
      try {
        const data = await extractDataFromQuotationImage(dataUrl, (p, msg) => {
          setExtractProgress(p);
          setExtractStatusMsg(msg);
        });

        if (data.senderName && data.senderName !== 'Cliente / Solicitante') {
          setCustomSenderName(data.senderName);
        }
        if (data.senderCompany && data.senderCompany !== 'Empresa / Solicitante') {
          setCustomSenderCompany(data.senderCompany);
        }
        if (data.senderEmail && data.senderEmail !== 'cliente@empresa.com.br') {
          setCustomSenderEmail(data.senderEmail);
        }
        if (data.senderPhone) {
          setCustomSenderPhone(data.senderPhone);
        }
        if (data.deliveryLocation) {
          setCustomDeliveryLocation(data.deliveryLocation);
        }
        if (data.subject) {
          setCustomSubject(data.subject);
        }
        if (data.items && data.items.length > 0) {
          setExtractedItemsForNewEmail(data.items);
        }
      } catch (err) {
        console.warn('Auto extraction error:', err);
      } finally {
        setIsExtractingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleContainerPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setCustomModeType('image');
          handleImageSelected(file);
          return;
        }
      }
    }
  };

  const handleClearImage = () => {
    setPastedImageFile(null);
    setPastedImagePreview(null);
    setPastedImageDataUrl(null);
    setExtractedItemsForNewEmail([]);
  };

  const handleCreateEmailFromPhoto = () => {
    if (!pastedImageDataUrl) return;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 16px; background-color: #f8fafc; color: #1e293b;">
        <div style="margin-bottom: 12px; padding: 10px 14px; background-color: #e0f2fe; border-left: 4px solid #0284c7; border-radius: 6px; font-size: 13px; color: #0369a1; font-weight: bold;">
          📷 Requisição de Cotação recebida como Foto / Print da Tela
        </div>
        <div style="text-align: center; background-color: #ffffff; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07);">
          <img src="${pastedImageDataUrl}" style="max-width: 100%; height: auto; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" alt="Print da Cotação" />
        </div>
      </div>
    `;

    const newEmail: IncomingEmail = {
      id: `mail-photo-${Date.now()}`,
      senderName: customSenderName.trim() || 'Cliente / Solicitante',
      senderEmail: (customSenderEmail.trim() || 'cliente@empresa.com.br').toLowerCase(),
      senderCompany: customSenderCompany.trim() || 'Empresa / Solicitante',
      subject: customSubject.trim() || 'Cotação Avulsa (Foto / Print)',
      date: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      snippet: extractedItemsForNewEmail.length > 0 
        ? `${extractedItemsForNewEmail.length} itens extraídos via foto/print.` 
        : 'Requisição de cotação enviada via imagem / foto / print.',
      body: 'Requisição recebida como imagem / foto anexa.',
      bodyHtml: emailHtml,
      senderPhone: customSenderPhone.trim() || '',
      deliveryLocation: customDeliveryLocation.trim() || 'Brasília - DF',
      unread: false,
      status: 'new',
      suggestedItems: extractedItemsForNewEmail
    };

    if (onAddManualAnalysis) {
      onAddManualAnalysis(newEmail);
    } else if (onAddCustomEmail) {
      // fallback: sem destino avulso configurado, joga no inbox
      onAddCustomEmail(newEmail);
      setSelectedEmail(newEmail);
      setEditableItems(extractedItemsForNewEmail);
    }

    if (onAddManualAnalysis) {
      // não seleciona no inbox — o email foi para Análises Avulsas
      setIsCustomMode(false);
      handleClearImage();
      setInboxLinkFeedback('✓ Análise salva em "Análises Avulsas" — disponível sempre que precisar!');
      setTimeout(() => setInboxLinkFeedback(null), 5000);
    }
  };

  const handleExtractFromCurrentPhoto = async () => {
    if (!selectedEmail) return;

    let imgSrc: string | null = null;
    if (selectedEmail.bodyHtml) {
      const match = selectedEmail.bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match) imgSrc = match[1];
    }
    if (!imgSrc && pastedImageDataUrl) {
      imgSrc = pastedImageDataUrl;
    }
    if (!imgSrc && selectedEmail.subject.includes('2026-08-27')) {
      imgSrc = 'WhatsApp Image 2026-08-27';
    }

    setIsExtractingPhoto(true);
    setExtractProgress(15);
    setExtractStatusMsg('Analisando documento e tabela de produtos...');

    try {
      const data = await extractDataFromQuotationImage(imgSrc || selectedEmail.subject, (p, msg) => {
        setExtractProgress(p);
        setExtractStatusMsg(msg);
      });

      if (data.items && data.items.length > 0) {
        setEditableItems(data.items);
        setEditSenderName(data.senderName);
        setEditSenderCompany(data.senderCompany);
        setEditSenderPhone(data.senderPhone || '');
        setEditDeliveryLocation(data.deliveryLocation || 'Brasília - DF');

        // Persist to email and storage
        if (onUpdateEmailDetails) {
          onUpdateEmailDetails(selectedEmail.id, {
            senderName: data.senderName,
            senderCompany: data.senderCompany,
            senderEmail: data.senderEmail,
            senderPhone: data.senderPhone,
            deliveryLocation: data.deliveryLocation,
            subject: data.subject || selectedEmail.subject,
            suggestedItems: data.items
          });
        }

        setSelectedEmail(prev => prev ? {
          ...prev,
          senderName: data.senderName,
          senderCompany: data.senderCompany,
          senderEmail: data.senderEmail,
          senderPhone: data.senderPhone,
          deliveryLocation: data.deliveryLocation,
          subject: data.subject || prev.subject,
          suggestedItems: data.items
        } : null);

        setInboxLinkFeedback(`✓ ${data.items.length} itens extraídos da requisição de ${data.senderName} (${data.senderCompany}) com sucesso!`);
        setTimeout(() => setInboxLinkFeedback(null), 6000);
      }
    } catch (err) {
      console.error('Erro na extração ótica:', err);
    } finally {
      setIsExtractingPhoto(false);
    }
  };

  const handleCreateEmailFromText = () => {
    if (!customText.trim()) return;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 16px; background-color: #ffffff; color: #1e293b; line-height: 1.6; white-space: pre-wrap; font-size: 13px;">
        ${customText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </div>
    `;

    const newEmail: IncomingEmail = {
      id: `mail-text-${Date.now()}`,
      senderName: customSenderName.trim() || 'Cliente / Solicitante',
      senderEmail: (customSenderEmail.trim() || 'cliente@empresa.com.br').toLowerCase(),
      senderCompany: customSenderCompany.trim() || 'Empresa / Solicitante',
      subject: customSubject.trim() || 'Cotação Avulsa (Texto Colado)',
      date: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      snippet: customText.slice(0, 90),
      body: customText,
      bodyHtml: emailHtml,
      senderPhone: customSenderPhone.trim() || '',
      deliveryLocation: customDeliveryLocation.trim() || 'Brasília - DF',
      unread: false,
      status: 'new',
      suggestedItems: []
    };

    if (onAddManualAnalysis) {
      onAddManualAnalysis(newEmail);
    } else if (onAddCustomEmail) {
      // fallback: sem destino avulso configurado, joga no inbox
      onAddCustomEmail(newEmail);
      setSelectedEmail(newEmail);
      setEditableItems([]);
    }

    if (onAddManualAnalysis) {
      setIsCustomMode(false);
      setInboxLinkFeedback('✓ Análise salva em "Análises Avulsas" — disponível sempre que precisar!');
      setTimeout(() => setInboxLinkFeedback(null), 5000);
    }
  };

  // Sender / Company inline edit state
  const [isEditingSender, setIsEditingSender] = useState(false);
  const [editSenderCompany, setEditSenderCompany] = useState('');
  const [editSenderName, setEditSenderName] = useState('');
  const [editSenderPhone, setEditSenderPhone] = useState('');
  const [editDeliveryLocation, setEditDeliveryLocation] = useState('');
  const [inboxLinkFeedback, setInboxLinkFeedback] = useState<string | null>(null);

  const handleStartEditSender = () => {
    if (!selectedEmail) return;
    setEditSenderCompany(selectedEmail.senderCompany || '');
    setEditSenderName(selectedEmail.senderName || '');
    setEditSenderPhone(selectedEmail.senderPhone || '');
    setEditDeliveryLocation(selectedEmail.deliveryLocation || 'Brasília - DF');
    setIsEditingSender(true);
  };

  const handleSaveSenderAndLink = () => {
    if (!selectedEmail) return;
    const updates: Partial<IncomingEmail> = {
      senderCompany: editSenderCompany.trim() || selectedEmail.senderCompany,
      senderName: editSenderName.trim() || selectedEmail.senderName,
      senderPhone: editSenderPhone.trim(),
      deliveryLocation: editDeliveryLocation.trim() || 'Brasília - DF'
    };

    setSelectedEmail(prev => prev ? { ...prev, ...updates } : null);
    setIsEditingSender(false);

    onUpdateEmailDetails?.(selectedEmail.id, updates);

    if (updates.senderCompany && updates.senderName) {
      registerOrUpdateClient(
        updates.senderCompany,
        updates.senderName,
        selectedEmail.senderEmail,
        updates.senderPhone,
        updates.deliveryLocation
      );
      setInboxLinkFeedback(`"${updates.senderName}" vinculado à "${updates.senderCompany}" na Agenda com sucesso!`);
      setTimeout(() => setInboxLinkFeedback(null), 4000);
    }
  };

  const safeEmails = React.useMemo(() => {
    return (Array.isArray(emails) ? emails : []).filter(Boolean);
  }, [emails]);

  React.useEffect(() => {
    if (safeEmails.length > 0 && (!selectedEmail || !safeEmails.find(e => e.id === selectedEmail.id))) {
      setSelectedEmail(safeEmails[0]);
    } else if (safeEmails.length === 0) {
      setSelectedEmail(null);
    }
  }, [safeEmails]);

  React.useEffect(() => {
    if (selectedEmail && Array.isArray(selectedEmail.suggestedItems)) {
      const unified = selectedEmail.suggestedItems.map(item => {
        const name = (item.name || '').trim();
        const desc = (item.description || '').trim();
        let fullName = name;
        if (desc && desc !== name && !name.toLowerCase().includes(desc.toLowerCase())) {
          fullName = `${name} — ${desc}`;
        }
        return {
          ...item,
          name: fullName,
          description: '',
          rawSearchQuery: String(item.rawSearchQuery || fullName)
        };
      });
      setEditableItems(unified);
    } else {
      setEditableItems([]);
    }
  }, [selectedEmail]);

  const handleUpdateItem = (idx: number, field: string, value: any) => {
    setEditableItems(prev => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = { ...copy[idx], [field]: value };
        if (field === 'name') {
          copy[idx].rawSearchQuery = value;
        }
      }
      return copy;
    });
  };

  const handleRemoveItem = (idx: number) => {
    setEditableItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddItem = () => {
    setEditableItems(prev => [
      ...prev,
      {
        name: '',
        description: '',
        rawSearchQuery: '',
        quantity: 1,
        unit: 'Un.',
        estimatedCost: 150
      }
    ]);
  };

  const handleLoadToQuote = () => {
    if (!selectedEmail) return;
    onSelectEmailToQuote({
      ...selectedEmail,
      suggestedItems: editableItems
    });
  };

  const filteredEmails = safeEmails.filter(m => {
    if (!m) return false;
    const q = (filterText || '').toLowerCase().trim();
    if (!q) return true;
    const subject = (m.subject || '').toLowerCase();
    const company = (m.senderCompany || '').toLowerCase();
    const sender = (m.senderName || '').toLowerCase();
    return subject.includes(q) || company.includes(q) || sender.includes(q);
  });

  const handleProcessCustom = () => {
    if (!customText.trim()) return;
    onParseCustomEmail(customText);
  };

  return (
    <div className="space-y-6">
      
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-full bg-gradient-to-l from-sky-500/5 to-transparent pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-600 shadow-xs">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Inbox Google Workspace</h1>
                {isGoogleConnected ? (
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Conectado: {connectedEmail || 'Gmail Infodesk'}</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold rounded-full flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Modo Desconectado</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                A IA analisa e-mails de clientes recebidos, extrai itens solicitados e monta propostas instantaneamente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isGoogleConnected ? (
              <button
                onClick={onConnectGoogle}
                disabled={isSyncing}
                className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 active:scale-95"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{isSyncing ? 'Conectando...' : 'Conectar Gmail Real'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => onRefreshEmails?.(currentPeriod)}
                  disabled={isSyncing}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Buscando...' : 'Sincronizar Gmail'}</span>
                </button>

                <button
                  onClick={onDisconnectGoogle}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl transition"
                  title="Desconectar conta Google"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              onClick={() => setIsCustomMode(!isCustomMode)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-2 ${
                isCustomMode 
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs' 
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-xs'
              }`}
            >
              <FileEdit className="w-4 h-4 text-indigo-600" />
              <span>Colar E-mail Avulso</span>
            </button>
          </div>
        </div>

        {syncError && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{syncError}</span>
          </div>
        )}
      </div>

      {isCustomMode && (
        <div 
          onPaste={handleContainerPaste}
          className="bg-white border-2 border-indigo-300 rounded-2xl p-6 shadow-md space-y-5 animate-in fade-in duration-200"
        >
          {/* Header com Abas: Texto vs Foto */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Analisador de Cotação Avulsa com IA</h3>
                <p className="text-xs text-slate-500">Cole o texto copiado ou envie uma foto/print da requisição do cliente</p>
              </div>
            </div>

            {/* Alternador: Texto vs Foto */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setCustomModeType('text')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  customModeType === 'text'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Colar Texto</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomModeType('image')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  customModeType === 'image'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600" />
                <span>Foto / Print da Cotação</span>
                {pastedImagePreview && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                )}
              </button>
            </div>
          </div>

          {/* Dica amigável de Ctrl+V universal */}
          <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl px-3.5 py-2 text-xs text-indigo-800 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="font-bold">💡 Dica:</span> 
              <span>Você pode tirar um print na tela (Win+Shift+S) e colar diretamente aqui com <kbd className="px-1.5 py-0.5 bg-white border border-indigo-300 rounded text-[11px] font-mono font-bold text-indigo-900">Ctrl + V</kbd>. A imagem será aberta no Inbox como e-mail HTML!</span>
            </span>
          </div>

          {/* MODO 1: COLAR TEXTO */}
          {customModeType === 'text' && (
            <div className="space-y-4">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Exemplo:&#10;Prezado Lucas, favor cotar para o Tribunal de Justiça:&#10;15 Monitores Dell 27 4K&#10;30 Cabos HDMI 2.0 2 metros&#10;Contato: Dr. Marcos — marcos@tjdf.jus.br — Tel: (61) 3400-0000"
                rows={6}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed shadow-2xs"
                autoFocus
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Empresa</label>
                  <input
                    type="text"
                    value={customSenderCompany}
                    onChange={(e) => setCustomSenderCompany(e.target.value)}
                    placeholder="Ex: UBEC ou CNC"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Comprador / Solicitante</label>
                  <input
                    type="text"
                    value={customSenderName}
                    onChange={(e) => setCustomSenderName(e.target.value)}
                    placeholder="Ex: Marcos Silva"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={customSenderPhone}
                    onChange={(e) => setCustomSenderPhone(e.target.value)}
                    placeholder="Ex: (61) 99999-0000"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Local de Entrega</label>
                  <input
                    type="text"
                    value={customDeliveryLocation}
                    onChange={(e) => setCustomDeliveryLocation(e.target.value)}
                    placeholder="Ex: Brasília - DF"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* MODO 2: FOTO / PRINT (USAR COMO HTML) */}
          {customModeType === 'image' && (
            <div className="space-y-4">
              {!pastedImageDataUrl ? (
                /* Zona de Upload / Drag and Drop */
                <label 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      handleImageSelected(file);
                    }
                  }}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/70 rounded-2xl p-8 cursor-pointer transition text-center group"
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelected(file);
                    }}
                  />
                  <div className="w-14 h-14 bg-indigo-100 group-hover:bg-indigo-200 text-indigo-700 rounded-2xl flex items-center justify-center mb-3 transition shadow-xs">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">
                    Clique para selecionar a foto ou dê Ctrl + V aqui dentro
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mb-3">
                    A foto será aberta no Inbox como e-mail HTML na íntegra, exatamente como um e-mail recebido do Gmail!
                  </p>
                  <span className="px-3.5 py-1.5 bg-white border border-indigo-200 group-hover:border-indigo-400 text-indigo-700 text-xs font-bold rounded-xl shadow-2xs transition">
                    Procurar no Computador
                  </span>
                </label>
              ) : (
                /* Card com a Foto Carregada e Campos Rápidos do Cliente */
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Foto Carregada: {pastedImageFile?.name || 'Captura de Tela (Print)'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearImage}
                      className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 font-semibold px-2.5 py-1 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Trocar Imagem</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                    {/* Preview da Foto */}
                    <div className="md:col-span-5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col items-center justify-center max-h-80 overflow-hidden">
                      <img 
                        src={pastedImageDataUrl} 
                        alt="Foto da Cotação" 
                        className="max-h-72 w-auto object-contain rounded-lg shadow-2xs"
                      />
                    </div>

                    {/* Formulário de Identificação do E-mail */}
                    <div className="md:col-span-7 space-y-3">
                      <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 leading-relaxed">
                        <span className="font-bold">✨ Visualização Direta em HTML:</span>
                        <p className="mt-0.5 text-sky-800">
                          Esta foto será carregada diretamente no leitor de e-mails do Inbox. Você poderá visualizar a imagem original na tela, ajustar os dados do comprador e preencher os itens na cotação com margens!
                        </p>
                      </div>

                      <div className="space-y-2.5 pt-1">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700 mb-1">Assunto do E-mail</label>
                          <input
                            type="text"
                            value={customSubject}
                            onChange={(e) => setCustomSubject(e.target.value)}
                            placeholder="Ex: Cotação via Foto / Print - Aeroporto de Brasília"
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">Empresa Solicitante</label>
                            <input
                              type="text"
                              value={customSenderCompany}
                              onChange={(e) => setCustomSenderCompany(e.target.value)}
                              placeholder="Ex: Inframerica ou UBEC"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">Comprador / Solicitante</label>
                            <input
                              type="text"
                              value={customSenderName}
                              onChange={(e) => setCustomSenderName(e.target.value)}
                              placeholder="Ex: Lidiane Ramos"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">Telefone (opcional)</label>
                            <input
                              type="text"
                              value={customSenderPhone}
                              onChange={(e) => setCustomSenderPhone(e.target.value)}
                              placeholder="Ex: (61) 3364-9000"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">Local de Entrega</label>
                            <input
                              type="text"
                              value={customDeliveryLocation}
                              onChange={(e) => setCustomDeliveryLocation(e.target.value)}
                              placeholder="Ex: Aeroporto de Brasília"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botões de Ação Final */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500">
              {customModeType === 'image' ? (
                pastedImageDataUrl ? (
                  <span className="text-emerald-700 font-semibold">✓ Foto carregada e pronta para abrir no Inbox como HTML</span>
                ) : (
                  <span>Selecione uma foto ou dê Ctrl+V para prosseguir</span>
                )
              ) : (
                customText.trim() ? (
                  <span>✓ Texto inserido e pronto para processamento</span>
                ) : (
                  <span>Cole o texto da cotação para prosseguir</span>
                )
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(false);
                  handleClearImage();
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Cancelar
              </button>

              {customModeType === 'image' ? (
                <button
                  type="button"
                  onClick={handleCreateEmailFromPhoto}
                  disabled={!pastedImageDataUrl}
                  className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 active:scale-95 whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" />
                  <span>Criar E-mail no Inbox com esta Imagem</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCreateEmailFromText}
                    disabled={!customText.trim()}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                  >
                    <Mail className="w-3.5 h-3.5 text-sky-600" />
                    <span>Criar E-mail no Inbox</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleProcessCustom}
                    disabled={!customText.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 active:scale-95 whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Extrair Itens & Montar Orçamento</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 ml-1" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar por cliente, órgão ou assunto..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* Quick Period Filter Pills */}
          <div className="px-3.5 py-2 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between gap-1 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-500 font-semibold shrink-0">
              <Calendar className="w-3.5 h-3.5 text-sky-600" />
              <span>Período:</span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {[
                { id: '3d', label: '3 dias' },
                { id: '7d', label: '7 dias' },
                { id: '15d', label: '15 dias' },
                { id: '30d', label: '30 dias' },
                { id: 'all', label: 'Tudo' }
              ].map(p => {
                const active = currentPeriod === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onRefreshEmails?.(p.id as EmailPeriodFilter)}
                    disabled={isSyncing}
                    className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] shrink-0 ${
                      active
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 hover:border-slate-300'
                    } ${isSyncing ? 'opacity-50 cursor-wait' : ''}`}
                    title={`Sincronizar e-mails dos últimos ${p.label}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Nenhum e-mail na caixa</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-[220px] mx-auto">
                    Conecte sua conta do Gmail para carregar cotações reais ou cole uma solicitação avulsa.
                  </p>
                </div>
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`p-4 cursor-pointer transition relative ${
                      isSelected 
                        ? 'bg-sky-50/80 border-l-4 border-l-sky-600' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-xs text-slate-900 truncate max-w-[200px]">
                        {email.senderCompany}
                      </span>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {email.date}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-slate-800 truncate mb-1">
                      {email.subject}
                    </p>

                    <p className="text-[11px] text-slate-500 line-clamp-2 mb-2">
                      {email.snippet}
                    </p>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-sky-700 text-[10px] font-medium rounded-md border border-slate-200 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-sky-600" />
                        {(email.suggestedItems || []).length} {(email.suggestedItems || []).length === 1 ? 'item detectado' : 'itens detectados'}
                      </span>
                      {email.unread && (
                        <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          {selectedEmail ? (
            <>
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">
                      {selectedEmail.subject || '(Sem Assunto)'}
                    </h3>
                    <span className="text-xs text-slate-500 inline-block mt-1 bg-slate-100 px-2.5 py-0.5 rounded-full font-medium">
                      {selectedEmail.date || 'Hoje'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(selectedEmail.bodyHtml?.includes('<img') || selectedEmail.subject?.includes('Foto / Print')) && (
                      <button
                        type="button"
                        onClick={handleExtractFromCurrentPhoto}
                        disabled={isExtractingPhoto}
                        className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
                        title="Ler tabela de itens, quantidades e comprador da foto com IA"
                      >
                        {isExtractingPhoto ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Lendo Foto ({extractProgress}%)...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-amber-200" />
                            <span>Extrair Itens da Foto com IA</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleLoadToQuote}
                      disabled={editableItems.length === 0}
                      className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 active:scale-95"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Gerar Orçamento IA</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isEditingSender ? (
                  <div className="bg-sky-50/70 border border-sky-300 rounded-xl p-3.5 mb-4 shadow-xs space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Editar Solicitante, Empresa & Vincular</span>
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setIsEditingSender(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block text-[10.5px] font-bold text-slate-700 mb-1">Empresa / Órgão</label>
                        <input
                          type="text"
                          value={editSenderCompany}
                          onChange={(e) => setEditSenderCompany(e.target.value)}
                          placeholder="Ex: UBEC ou CNC"
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-semibold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-bold text-slate-700 mb-1">Nome do Solicitante / Comprador</label>
                        <input
                          type="text"
                          value={editSenderName}
                          onChange={(e) => setEditSenderName(e.target.value)}
                          placeholder="Ex: Alex Pereira"
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-semibold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-medium text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input
                          type="text"
                          value={editSenderPhone}
                          onChange={(e) => setEditSenderPhone(e.target.value)}
                          placeholder="Ex: (61) 3403-2944"
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-medium text-slate-700 mb-1">Local de Entrega</label>
                        <input
                          type="text"
                          value={editDeliveryLocation}
                          onChange={(e) => setEditDeliveryLocation(e.target.value)}
                          placeholder="Ex: Brasília - DF"
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingSender(false)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveSenderAndLink}
                        className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar e Vincular Comprador à Empresa</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-xs text-slate-600 pb-4 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-y-2 gap-x-4">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        <User className="w-3.5 h-3.5 text-sky-600" />
                        <span>{selectedEmail.senderName || 'Solicitante'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{selectedEmail.senderEmail || 'email@cliente.com'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                        <Building className="w-3.5 h-3.5 text-sky-600" />
                        <span>{selectedEmail.senderCompany || 'Empresa'}</span>
                      </div>
                      {selectedEmail.senderPhone && (
                        <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{selectedEmail.senderPhone}</span>
                        </div>
                      )}
                      {selectedEmail.deliveryLocation && (
                        <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                          <MapPin className="w-3.5 h-3.5 text-amber-600" />
                          <span>{selectedEmail.deliveryLocation}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStartEditSender}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 hover:border-sky-300 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1"
                        title="Editar nome da empresa, comprador ou telefone e vincular"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Editar / Vincular</span>
                      </button>

                      {onOpenClientManagement && (
                        <button
                          type="button"
                          onClick={onOpenClientManagement}
                          className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1"
                          title="Abrir agenda completa de empresas e compradores"
                        >
                          <Users className="w-3.5 h-3.5 text-sky-600" />
                          <span>Agenda</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {inboxLinkFeedback && (
                  <div className="p-2.5 my-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{inboxLinkFeedback}</span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Conteúdo Original da Solicitação
                  </span>
                  {selectedEmail.bodyHtml && (
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setEmailViewMode('html')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition ${
                          emailViewMode === 'html' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Visualização Rica (HTML)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailViewMode('text')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition ${
                          emailViewMode === 'text' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Texto Simples
                      </button>
                    </div>
                  )}
                </div>

                {emailViewMode === 'html' && selectedEmail.bodyHtml ? (
                  <iframe 
                    title={`E-mail de ${selectedEmail.senderCompany || 'Cliente'}`}
                    sandbox="allow-same-origin"
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12px;line-height:1.5;color:#1e293b;padding:12px;margin:0;word-break:break-word;background:#ffffff;}table{border-collapse:collapse;width:100%;max-width:100%;margin-bottom:12px;}th,td{padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;}img{max-width:100%;height:auto;}</style></head><body>${selectedEmail.bodyHtml}</body></html>`}
                    className="w-full h-[380px] bg-white border border-slate-200 rounded-xl"
                  />
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-800 whitespace-pre-line leading-relaxed font-sans max-h-[440px] overflow-y-auto">
                    {selectedEmail.body || 'Sem conteúdo de texto disponível.'}
                  </div>
                )}
              </div>

              <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-800">
                      Itens Identificados pela IA para a Infodesk
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium bg-white px-2 py-0.5 rounded border border-sky-200">
                    {(editableItems || []).length} {(editableItems || []).length === 1 ? 'item pronto' : 'itens prontos'} · Editáveis
                  </span>
                </div>

                <div className="space-y-3">
                  {editableItems.map((item, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 hover:border-sky-300 p-3.5 rounded-xl shadow-2xs transition space-y-2.5 group">
                      
                      {/* Top Bar: Item number badge, label, and Quantity/Unit + Delete controls */}
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                            Item #{idx + 1}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            Texto Capturado para Pesquisa Exata:
                          </span>
                        </div>

                        {/* Quantity and Unit controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                            <span className="text-[10px] text-slate-400 pl-2 font-semibold">Qtd:</span>
                            <input 
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(idx, 'quantity', Number(e.target.value) || 1)}
                              className="w-12 text-center text-xs font-bold text-slate-900 bg-transparent py-1 focus:outline-none"
                              title="Quantidade do produto"
                            />
                            <select 
                              value={item.unit || 'Un.'}
                              onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                              className="text-xs font-bold text-slate-700 bg-transparent border-l border-slate-200 px-2 py-1 focus:outline-none cursor-pointer"
                              title="Unidade de medida"
                            >
                              <option value="Un.">Un.</option>
                              <option value="Cx.">Cx.</option>
                              <option value="Pct.">Pct.</option>
                              <option value="Kit">Kit</option>
                              <option value="Kg">Kg</option>
                              <option value="Lt.">Lt.</option>
                              <option value="M">M</option>
                              <option value="Par">Par</option>
                            </select>
                          </div>

                          <button 
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-200"
                            title="Remover este item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Large, multi-line editable textarea for full readability */}
                      <div className="space-y-1">
                        <textarea 
                          rows={Math.max(2, Math.min(6, Math.ceil((item.name || '').length / 60)))}
                          value={item.name}
                          onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                          placeholder="Descrição completa, marca, modelo, códigos de referência e especificações..."
                          className="w-full text-xs font-semibold text-slate-900 bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-sky-500 rounded-xl p-3 leading-relaxed focus:outline-none resize-y transition shadow-2xs font-sans min-h-[60px]"
                          title="Todas as informações do produto (usadas integralmente na busca exata)"
                        />
                      </div>
                    </div>
                  ))}

                  {editableItems.length === 0 && (
                    <div className="text-center py-6 px-4 text-slate-600 text-xs bg-white rounded-xl border-2 border-dashed border-amber-200 space-y-2.5">
                      <p className="font-semibold text-slate-700">
                        Nenhum item adicionado ainda nesta cotação.
                      </p>
                      {(selectedEmail.bodyHtml?.includes('<img') || selectedEmail.subject?.includes('Foto / Print')) && (
                        <button
                          type="button"
                          onClick={handleExtractFromCurrentPhoto}
                          disabled={isExtractingPhoto}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center gap-1.5 active:scale-95"
                        >
                          <Sparkles className="w-4 h-4 text-amber-200" />
                          <span>Extrair Itens da Foto com IA Agora</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800 bg-white hover:bg-sky-50 border border-sky-200 rounded-lg shadow-2xs transition active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Item Manual</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadToQuote}
                    disabled={editableItems.length === 0}
                    className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 active:scale-95"
                  >
                    <span>Carregar na Cotação com Margens</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              Selecione um e-mail na lista para visualizar os detalhes
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
