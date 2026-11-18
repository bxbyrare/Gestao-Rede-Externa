import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import gsap from 'gsap';
import { ArrowUpRight } from 'lucide-react';

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
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' },
      );
    }
  }, [visible]);

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  }

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
      className="fixed bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 z-[950] flex justify-center pointer-events-none"
    >
      {/* Double-Bezel Studio Black Card */}
      <div
        onMouseMove={handleMouseMove}
        className="pointer-events-auto w-full max-w-4xl rounded-2xl p-[1px] bg-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.9)]"
        style={{
          backgroundImage:
            'radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.22), transparent 50%)',
        }}
      >
        <div className="rounded-2xl bg-[#090C13]/95 backdrop-blur-2xl px-4 py-4 sm:px-6 sm:py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#a1a1a6]">
                PRIVACIDADE · LGPD
              </span>
              <span className="text-white/20">•</span>
              <span className="text-[10px] font-mono text-white/40">180 DIAS</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Sua privacidade, sua escolha
            </h3>
            <p className="text-xs text-[#a1a1a6] leading-relaxed max-w-2xl">
              Usamos armazenamento essencial para autenticação e segurança do portal. Com sua permissão, coletamos métricas de desempenho nos logs para manter tudo rápido e estável. Recusar não impede o acesso.
            </p>
            <div className="pt-0.5">
              <a
                href="/privacidade#tecnologias"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white underline underline-offset-4 transition"
              >
                <span>Política de Privacidade (nova aba)</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
            {storageBlocked && (
              <p className="text-[11px] text-amber-300 pt-1">
                Armazenamento local bloqueado neste navegador; métricas mantidas desativadas nesta sessão.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={() => applyChoice(false)}
              className="px-3.5 sm:px-4 py-2.5 rounded-full text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.12] text-white transition cursor-pointer text-center"
            >
              Recusar métricas
            </button>
            <button
              type="button"
              onClick={() => applyChoice(true)}
              className="px-4 sm:px-5 py-2.5 rounded-full text-xs font-bold bg-white text-black hover:bg-neutral-200 transition cursor-pointer text-center"
            >
              Aceitar métricas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
