import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Cookie, ExternalLink } from 'lucide-react';

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

export function savePrivacyConsent(metrics: boolean): boolean {
  try {
    const now = Date.now();
    const state: PrivacyConsentState = {
      essential: true,
      metrics,
      updatedAt: now,
      expiresAt: now + CONSENT_TTL_MS,
    };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('privacy-consent-changed', { detail: state }));
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
  const [storageBlocked, setStorageBlocked] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const existing = readPrivacyConsent();
    if (!existing) {
      setVisible(true);
    }

    const handleOpenPrefs = () => setVisible(true);
    const handleConsentChanged = () => setVisible(false);

    window.addEventListener('open-privacy-preferences', handleOpenPrefs);
    window.addEventListener('privacy-consent-changed', handleConsentChanged);
    return () => {
      window.removeEventListener('open-privacy-preferences', handleOpenPrefs);
      window.removeEventListener('privacy-consent-changed', handleConsentChanged);
    };
  }, []);

  useEffect(() => {
    if (visible && bannerRef.current) {
      gsap.fromTo(
        bannerRef.current,
        { y: 28, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' },
      );
    }
  }, [visible]);

  function applyChoice(metrics: boolean) {
    const saved = savePrivacyConsent(metrics);
    setStorageBlocked(!saved);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      role="dialog"
      aria-label="Preferências de privacidade e cookies"
      className="fixed bottom-4 left-4 right-4 z-[950] flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-4xl rounded-xl bg-[#0B0F17]/95 backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/70 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <Cookie className="w-4 h-4 text-[#e20613]" />
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Sua privacidade, sua escolha
            </h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Usamos armazenamento essencial para o funcionamento e segurança do portal. Com sua permissão, coletamos métricas de desempenho e navegação nos logs para manter tudo rápido e estável. Recusar não impede o acesso.
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

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => applyChoice(false)}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/15 text-white transition cursor-pointer"
          >
            Recusar métricas
          </button>
          <button
            type="button"
            onClick={() => applyChoice(true)}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition cursor-pointer"
          >
            Aceitar métricas
          </button>
        </div>
      </div>
    </div>
  );
}
