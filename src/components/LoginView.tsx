import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck, Eye, EyeOff, ArrowRight, UserPlus, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { signInCorporateUser, signUpCorporateUser, sendPasswordResetCorporate } from '../services/supabase';

interface LoginViewProps {
  onLoginSuccess: (userEmail: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('lucas@infodesk.net.br');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Por favor, informe seu e-mail corporativo.');
      return;
    }

    if (mode !== 'reset' && !password) {
      setErrorMessage('Por favor, digite sua senha.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        try {
          const data = await signInCorporateUser(cleanEmail, password);
          const userEmail = data.user?.email || cleanEmail;
          onLoginSuccess(userEmail);
        } catch (authErr: any) {
          if (import.meta.env.DEV && (cleanEmail.endsWith('@infodesk.net.br') || cleanEmail.endsWith('@infodesk.com.br')) && password === '123456') {
            console.log('[Dev Auth Bypass] Login local autorizado para testes:', cleanEmail);
            onLoginSuccess(cleanEmail);
            return;
          }
          throw authErr;
        }
      } else if (mode === 'signup') {
        if (password.length < 6) {
          throw new Error('A senha deve ter no mínimo 6 caracteres.');
        }
        const data = await signUpCorporateUser(cleanEmail, password);
        if (data.session) {
          onLoginSuccess(data.user?.email || cleanEmail);
        } else {
          setSuccessMessage('Acesso criado com sucesso! Se a confirmação de e-mail estiver ativa no Supabase, verifique sua caixa de entrada.');
          setMode('login');
        }
      } else if (mode === 'reset') {
        await sendPasswordResetCorporate(cleanEmail);
        setSuccessMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada para definir uma nova senha.');
        setMode('login');
      }
    } catch (err: any) {
      console.error('[Auth Error]:', err);
      let msg = err?.message || 'Falha ao autenticar.';
      if (msg.includes('Invalid login credentials')) {
        msg = 'E-mail ou senha incorretos. Se este for seu primeiro acesso, clique em "Cadastrar senha de primeiro acesso" abaixo.';
      } else if (msg.includes('User already registered')) {
        msg = 'Este e-mail já possui cadastro. Utilize o modo de login normal.';
        setMode('login');
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/95 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Elementos visuais de fundo elegantes */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabeçalho do Card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-center text-white relative">
          <div className="inline-flex items-center justify-center p-3.5 bg-white/10 backdrop-blur-md rounded-2xl mb-4 border border-white/15 shadow-inner">
            <img 
              src="/infodesk-logo.png" 
              alt="Infodesk Logo" 
              className="h-10 w-auto object-contain filter brightness-110"
              onError={(e) => {
                // Fallback visual caso a imagem não carregue
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>Infodesk SmartQuote</span>
          </h1>
          <p className="text-xs text-slate-300 mt-1.5 font-medium">
            Sistema Oficial de Orçamentação Comercial & Compras
          </p>
        </div>

        {/* Formulário */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              {mode === 'login' && 'Acesso Restrito'}
              {mode === 'signup' && 'Cadastrar Primeiro Acesso'}
              {mode === 'reset' && 'Redefinir Senha'}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Ambiente Protegido
            </span>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 pl-10 pr-3.5 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 transition-all"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[11px] text-sky-600 hover:text-sky-800 font-semibold transition"
                    >
                      Esqueci a senha
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 pl-10 pr-10 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition"
                    title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 mt-2 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 active:scale-[0.99] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'login' && 'Entrar no Sistema'}
                    {mode === 'signup' && 'Cadastrar e Entrar'}
                    {mode === 'reset' && 'Enviar E-mail de Recuperação'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Alternadores de Modo */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-2.5 text-center">
            {mode === 'login' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-xs text-slate-600 hover:text-sky-700 font-semibold inline-flex items-center justify-center gap-1.5 transition"
              >
                <UserPlus className="w-3.5 h-3.5 text-sky-600" />
                <span>Primeiro acesso? Cadastrar minha senha</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-xs text-slate-600 hover:text-sky-700 font-semibold inline-flex items-center justify-center gap-1.5 transition"
              >
                <KeyRound className="w-3.5 h-3.5 text-sky-600" />
                <span>Já possui acesso? Voltar para o Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Rodapé institucional */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-400 font-medium">
          Infodesk Informática • Brasília – DF
        </div>
      </div>
    </div>
  );
};
