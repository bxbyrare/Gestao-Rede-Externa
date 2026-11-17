import { useEffect, useState } from 'react';
import { Check, Cookie, ExternalLink, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';

const CONSENT_STORAGE_KEY = 'claro_privacy_consent_v1';
const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 dias

export interface PrivacyConsentState {
  essential: true;
  metrics: boolean;
  updatedAt: number;
  expiresAt: number;
}

export function readPrivacyConsent(): PrivacyConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrivacyConsentState;
    if (!parsed || typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePrivacyConsent(metrics: boolean): boolean {
  try {
    const now = Date.now();
    const state: PrivacyConsentState = {
      essential: true,
      metrics,
      updatedAt: now,
      expiresAt: now + CONSENT_TTL_MS,
    };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function openPrivacyPreferencesModal() {
  window.dispatchEvent(new CustomEvent('open-privacy-preferences'));
}

export default function PrivacyCookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [metricsEnabled, setMetricsEnabled] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    const existing = readPrivacyConsent();
    if (!existing) {
      setVisible(true);
    } else {
      setMetricsEnabled(Boolean(existing.metrics));
    }

    const handleOpenPrefs = () => {
      const current = readPrivacyConsent();
      setMetricsEnabled(Boolean(current?.metrics));
      setShowCustomize(true);
    };

    window.addEventListener('open-privacy-preferences', handleOpenPrefs);
    return () => window.removeEventListener('open-privacy-preferences', handleOpenPrefs);
  }, []);

  function applyChoice(metrics: boolean) {
    const saved = savePrivacyConsent(metrics);
    setMetricsEnabled(metrics);
    setStorageBlocked(!saved);
    setVisible(false);
    setShowCustomize(false);
  }

  return (
    <>
      {visible && !showCustomize && (
        <div
          role="dialog"
          aria-label="Preferências de privacidade e cookies"
          className="fixed bottom-4 left-4 right-4 z-[950] flex justify-center pointer-events-none"
        >
          <div className="pointer-events-auto w-full max-w-4xl rounded-2xl bg-[#0D1320]/95 backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/60 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <Cookie className="w-4 h-4 text-[#e20613]" />
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Sua privacidade, sua escolha
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Usamos armazenamento essencial para o funcionamento e segurança do portal. Com sua permissão, ativamos métricas próprias para entender os acessos e melhorar as páginas. Recusar não impede o acesso.
              </p>
              <div className="pt-0.5">
                <a
                  href="/privacidade#tecnologias"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2 transition"
                >
                  <span>Política de Privacidade (nova aba)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {storageBlocked && (
                <p className="text-[11px] text-amber-300 pt-1">
                  Seu navegador bloqueou o armazenamento local; as métricas permanecerão desativadas nesta sessão.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 shrink-0 min-w-[230px]">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => applyChoice(false)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/15 text-white transition cursor-pointer"
                >
                  Recusar métricas
                </button>
                <button
                  type="button"
                  onClick={() => applyChoice(true)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition shadow-lg shadow-[#e20613]/25 cursor-pointer"
                >
                  Aceitar métricas
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-slate-200 transition inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Personalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomize && (
        <div className="fixed inset-0 z-[960] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#0B101B] border border-white/15 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#e20613]/15 border border-[#e20613]/35 flex items-center justify-center text-[#e20613]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Preferências de Privacidade</h3>
                  <p className="text-[11px] text-slate-400">Escolha válida por 180 dias neste navegador</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomize(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white">Cookies e Armazenamento Essenciais</h4>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Sempre ativo
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Necessários para autenticação de sessão, proteção 2FA/TOTP, segurança contra acessos indevidos e filtros essenciais de operação.
                  </p>
                </div>
                <div className="w-10 h-6 rounded-full bg-emerald-500/30 border border-emerald-400/40 flex items-center justify-end px-1 shrink-0 opacity-80">
                  <div className="w-4 h-4 rounded-full bg-emerald-400" />
                </div>
              </div>

              <label className="rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 p-4 flex items-start justify-between gap-4 cursor-pointer transition">
                <div>
                  <h4 className="text-xs font-bold text-white">Métricas Próprias e Desempenho (Opcional)</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Permite registrar estatísticas internas de navegação e tempo de carregamento para aprimorar os módulos do Gestão Rede Externa.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={metricsEnabled}
                  onClick={() => setMetricsEnabled((v) => !v)}
                  className={`w-10 h-6 rounded-full border flex items-center px-1 transition shrink-0 ${
                    metricsEnabled
                      ? 'bg-[#e20613]/35 border-[#e20613]/60 justify-end'
                      : 'bg-white/10 border-white/20 justify-start'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full transition ${metricsEnabled ? 'bg-[#e20613]' : 'bg-slate-400'}`} />
                </button>
              </label>

              <div className="text-[11px] text-slate-400 pt-1">
                Consulte todos os detalhes em{' '}
                <a
                  href="/privacidade#tecnologias"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 underline"
                >
                  Política de Privacidade
                </a>
                .
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => applyChoice(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
              >
                Recusar opcionais
              </button>
              <button
                type="button"
                onClick={() => applyChoice(metricsEnabled)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition"
              >
                <Check className="w-3.5 h-3.5" />
                Salvar preferências
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
