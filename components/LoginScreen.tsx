import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, Loader2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { feedback } from '../utils/feedback';

interface LoginScreenProps {
  onLoginSuccess?: (session: any) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMessage('Introdueix el teu correu corporatiu i la contrasenya.');
      feedback.haptic([50, 50, 50]);
      return;
    }

    setLoading(true);
    try {
      // 1. Netejar qualsevol token antic o revocat de sessions anteriors
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (_) {}

      // 2. Executar login amb timeout estricte de 10s per evitar bloquejos infinits
      const authPromise = supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 10000)
      );

      const { data, error } = await Promise.race([authPromise, timeoutPromise]);

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Credencials incorrectes. Si us plau, revisa el correu i la contrasenya.');
        } else if (error.message.includes('Too many concurrent')) {
          setErrorMessage("S'ha detectat concurrència de sessions. Torna a prémer 'Entrar al Sistema'.");
        } else {
          setErrorMessage(error.message || 'Error en iniciar sessió.');
        }
        feedback.haptic([50, 50, 50]);
        return;
      }

      if (data?.session) {
        feedback.success();
        onLoginSuccess?.(data.session);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message === 'TIMEOUT') {
        setErrorMessage("El servidor d'accés està trigant a respondre. Si us plau, torna-ho a intentar.");
      } else {
        setErrorMessage(err.message || 'Error de connexió.');
      }
      feedback.haptic([50, 50, 50]);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage('Introdueix el teu correu corporatiu per rebre l’enllaç.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin
      });

      if (error) {
        setErrorMessage(error.message || 'No s’ha pogut enviar el correu de restabliment.');
      } else {
        setSuccessMessage('T’hem enviat un correu amb les instruccions per restablir la contrasenya.');
        feedback.success();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error en processar la petició.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#2B2F33]/90 backdrop-blur-xl p-4 overflow-y-auto">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-25">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#97BE14] rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#4D5358] rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md my-auto">
        <div className="bg-white dark:bg-[#1E2022] rounded-[32px] shadow-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
          {/* Header */}
          <div className="p-8 pb-6 text-center border-b border-gray-100 dark:border-white/5 bg-gradient-to-b from-gray-50/50 dark:from-white/5 to-transparent">
            <div className="flex items-center justify-center gap-3 mb-4">
              <img
                src="https://www.fgc.cat/wp-content/uploads/2020/06/logo-FGC-square.png"
                alt="FGC"
                className="w-12 h-12 rounded-2xl shadow-md object-cover"
              />
              <img
                src="/logo-pro.png"
                alt="NEXUS"
                className="h-10 w-auto object-contain"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#4D5358] dark:text-white uppercase tracking-tight font-fgc-title">
              Accés Supervisió
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-400 font-semibold mt-1">
              Plataforma de Gestió Ferroviària Integral (BV-FGC)
            </p>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-3 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold tracking-wider uppercase">
              <ShieldCheck size={12} strokeWidth={2.5} />
              <span>Accés Restringit · LOPD-GDD</span>
            </div>
          </div>

          {/* Body */}
          <div className="p-8 pt-6 space-y-5">
            {/* Alerts */}
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 flex items-start gap-2.5 text-red-700 dark:text-red-300 text-xs">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2.5 text-emerald-700 dark:text-emerald-300 text-xs">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span className="font-medium">{successMessage}</span>
              </div>
            )}

            {/* Mode 1: LOGIN */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4D5358] dark:text-gray-300 mb-1.5">
                    Correu corporatiu
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@fgc.cat"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-2xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#97BE14] focus:ring-2 focus:ring-[#97BE14]/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#4D5358] dark:text-gray-300">
                      Contrasenya
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[11px] font-bold text-[#97BE14] hover:underline"
                    >
                      Has oblidat la contrasenya?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-12 py-3 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-2xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#97BE14] focus:ring-2 focus:ring-[#97BE14]/20 transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-[#97BE14] focus:ring-[#97BE14] border-gray-300"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      Mantenir sessió iniciada
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3.5 px-4 bg-[#97BE14] hover:bg-[#85aa0f] active:scale-[0.98] text-[#4D5358] hover:text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-[#97BE14]/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Verificant credencials...</span>
                    </>
                  ) : (
                    <span>Entrar al Sistema</span>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.removeItem('nexus_fgc_auth_session_v2');
                        localStorage.removeItem('user_profile');
                        sessionStorage.clear();
                      } catch (_) {}
                      window.location.reload();
                    }}
                    className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    Problemes d'accés? Netejar sessió local i recarregar
                  </button>
                </div>
              </form>
            )}

            {/* Mode 2: FORGOT PASSWORD */}
            {mode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Indica la teva adreça oficial de correu (@fgc.cat) i rebràs un enllaç segur per restablir la contrasenya d'accés.
                </p>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4D5358] dark:text-gray-300 mb-1.5">
                    Correu corporatiu
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@fgc.cat"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-2xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#97BE14] focus:ring-2 focus:ring-[#97BE14]/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#4D5358] hover:bg-[#3D4247] active:scale-[0.98] text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Enviant correu...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound size={18} />
                      <span>Enviar enllaç de restabliment</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-[#97BE14] transition-colors"
                  >
                    ← Tornar a la pantalla d'inici
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6">
          <p className="text-[11px] text-gray-300 dark:text-gray-400 font-medium">
            Ferrocarrils de la Generalitat de Catalunya · Línia Barcelona-Vallès
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
