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
  AlertCircle
} from 'lucide-react';
import { IncomingEmail } from '../types';

interface InboxViewProps {
  emails: IncomingEmail[];
  onSelectEmailToQuote: (email: IncomingEmail) => void;
  onParseCustomEmail: (rawText: string) => void;
  isGoogleConnected?: boolean;
  connectedEmail?: string | null;
  isSyncing?: boolean;
  syncError?: string | null;
  onConnectGoogle?: () => void;
  onDisconnectGoogle?: () => void;
  onRefreshEmails?: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  emails,
  onSelectEmailToQuote,
  onParseCustomEmail,
  isGoogleConnected = false,
  connectedEmail = 'lucas@infodesk.com.br',
  isSyncing = false,
  syncError = null,
  onConnectGoogle,
  onDisconnectGoogle,
  onRefreshEmails
}) => {
  const [selectedEmail, setSelectedEmail] = useState<IncomingEmail | null>(emails[0] || null);
  const [filterText, setFilterText] = useState('');
  const [customText, setCustomText] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  React.useEffect(() => {
    if (emails.length > 0 && (!selectedEmail || !emails.find(e => e.id === selectedEmail.id))) {
      setSelectedEmail(emails[0]);
    } else if (emails.length === 0) {
      setSelectedEmail(null);
    }
  }, [emails]);

  const filteredEmails = emails.filter(m => 
    m.subject.toLowerCase().includes(filterText.toLowerCase()) ||
    m.senderCompany.toLowerCase().includes(filterText.toLowerCase()) ||
    m.senderName.toLowerCase().includes(filterText.toLowerCase())
  );

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
                  onClick={onRefreshEmails}
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
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Analisador de E-mail / Requisição com IA</h3>
            </div>
            <span className="text-xs text-indigo-600">Cole o texto completo recebido do cliente</span>
          </div>

          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Exemplo: Prezado Lucas, favor cotar para o Tribunal de Justiça: 15 Monitores Dell 27 4K e 30 Cabos HDMI 2.0. Contato: Dr. Marcos marcos@tjdf.jus.br"
            rows={5}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsCustomMode(false)}
              className="px-4 py-2 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleProcessCustom}
              disabled={!customText.trim()}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Extrair Itens & Montar Orçamento</span>
            </button>
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
                        {email.suggestedItems.length} {email.suggestedItems.length === 1 ? 'item detectado' : 'itens detectados'}
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
              <div className="border-b border-slate-200 pb-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{selectedEmail.subject}</h2>
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1 text-slate-800 font-medium">
                        <Building className="w-3.5 h-3.5 text-sky-600" /> {selectedEmail.senderCompany}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" /> {selectedEmail.senderName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> {selectedEmail.date}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectEmailToQuote(selectedEmail)}
                    className="px-4 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 active:scale-95 whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Gerar Orçamento IA</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-800 whitespace-pre-line leading-relaxed font-sans">
                {selectedEmail.body}
              </div>

              <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-800">
                      Itens Identificados pela IA para a Infodesk
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-500">Prontos para precificação</span>
                </div>

                <div className="space-y-2">
                  {selectedEmail.suggestedItems.map((item, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 p-3 rounded-lg flex items-center justify-between gap-4 shadow-xs">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{item.name}</p>
                        <p className="text-[11px] text-slate-500">{item.description}</p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                          {item.quantity} {item.unit}
                        </span>
                        {item.estimatedCost && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Custo est.: R$ {item.estimatedCost.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => onSelectEmailToQuote(selectedEmail)}
                    className="text-xs text-sky-700 hover:text-sky-800 font-semibold flex items-center gap-1.5 transition"
                  >
                    <span>Carregar no Montador de Proposta com Margens</span>
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
