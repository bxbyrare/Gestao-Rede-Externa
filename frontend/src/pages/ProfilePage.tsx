import { useState, useEffect, useRef, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Save,
  Loader2,
  Smartphone,
  RefreshCw,
  Moon,
  Sun,
  Monitor,
  Eclipse,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  Lock,
  UserCheck,
} from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';
import { applyDocumentTheme, resolveVisualTheme } from '../components/DashboardLayout';
import { formatPersonName } from '../utils/formatName';

type ThemePref = 'dark' | 'dim' | 'light' | 'system';

interface ThemeOption {
  id: ThemePref;
  title: string;
  badge: string;
  badgeClass: string;
  subtitle: string;
  recommendation: string;
  luminance: string;
  icon: typeof Moon;
  previewBg: string;
  previewSurface: string;
  previewRaised: string;
  previewText: string;
  previewMuted: string;
  previewBorder: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark',
    title: 'Escuro Obsidian',
    badge: 'Padrão',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    subtitle: 'Preto estúdio profundo com vidro lapidado e máximo contraste analítico.',
    recommendation: 'Ideal para NOC, centros de operações e ambientes internos.',
    luminance: 'Luminância 2% • Contraste OLED',
    icon: Moon,
    previewBg: '#030305',
    previewSurface: '#090C13',
    previewRaised: '#111622',
    previewText: '#ffffff',
    previewMuted: '#94a3b8',
    previewBorder: 'rgba(255,255,255,0.12)',
  },
  {
    id: 'dim',
    title: 'Grafite Conforto',
    badge: 'Longa Jornada',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    subtitle: 'Cinza-carvão equilibrado que suaviza o contraste sem perder a estética escura.',
    recommendation: 'Recomendado para plantões longos (8h+) e leitura contínua de tabelas.',
    luminance: 'Luminância 11% • Baixa Fadiga',
    icon: Eclipse,
    previewBg: '#131519',
    previewSurface: '#1b1e24',
    previewRaised: '#23272f',
    previewText: '#f2f3f5',
    previewMuted: '#a9adb7',
    previewBorder: 'rgba(255,255,255,0.14)',
  },
  {
    id: 'light',
    title: 'Claro Suave (Pérola)',
    badge: 'Anti-Ofuscamento',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    subtitle: 'Cinza-pérola e ardósia fosca sem branco puro (#FFFFFF), eliminando o brilho excessivo.',
    recommendation: 'Calibrado para operação em campo sob luz solar ou escritórios muito iluminados.',
    luminance: 'Luminância 86% • 0% Branco Puro',
    icon: Sun,
    previewBg: '#e3e6eb',
    previewSurface: '#eceef2',
    previewRaised: '#f3f4f7',
    previewText: '#1a1f29',
    previewMuted: '#4f5767',
    previewBorder: 'rgba(26,31,41,0.16)',
  },
  {
    id: 'system',
    title: 'Automático do Sistema',
    badge: 'Sincronizado',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    subtitle: 'Alterna automaticamente entre Escuro Obsidian e Claro Suave conforme seu dispositivo.',
    recommendation: 'Acompanha o horário diurno/noturno configurado no Windows, macOS, iOS ou Android.',
    luminance: 'Dinâmico • Segue o SO',
    icon: Monitor,
    previewBg: 'linear-gradient(135deg, #030305 50%, #e3e6eb 50%)',
    previewSurface: '#141821',
    previewRaised: '#eceef2',
    previewText: '#ffffff',
    previewMuted: '#94a3b8',
    previewBorder: 'rgba(255,255,255,0.16)',
  },
];

export default function ProfilePage() {
  const { user, updateUserState, refreshUser } = useAuth();
  const pageRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [themePref, setThemePref] = useState<ThemePref>('dark');
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [systemIsLight, setSystemIsLight] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    setSystemIsLight(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemIsLight(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      const storedTheme = localStorage.getItem(`claro_theme_user_${user.id}`) as ThemePref | null;
      const candidate = user.theme_preference || storedTheme || 'dark';
      const resolved: ThemePref =
        candidate === 'light' || candidate === 'dim' || candidate === 'system' ? candidate : 'dark';
      setThemePref(resolved);
    }
  }, [user]);

  // GSAP Choreographed Entrance Animation
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.profile-stagger-card',
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.07,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
        },
      );
      gsap.fromTo(
        '.theme-studio-tile',
        { opacity: 0, y: 14, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.48,
          stagger: 0.055,
          delay: 0.1,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
        },
      );
    }, root);

    return () => ctx.revert();
  }, []);

  const missing = user?.missing_fields || [];
  const completionPct = missing.length === 0 ? 100 : Math.max(40, 100 - missing.length * 20);

  async function handleSelectTheme(nextTheme: ThemePref, e?: ReactMouseEvent<HTMLButtonElement>) {
    const targetCard = e?.currentTarget;
    if (targetCard && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo(
        targetCard,
        { scale: 0.975 },
        { scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.5)' },
      );
    }

    const applyChange = () => {
      setThemePref(nextTheme);
      applyDocumentTheme(nextTheme);
    };

    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };

    if (
      docWithVT.startViewTransition &&
      e &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const x = e.clientX;
      const y = e.clientY;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      const transition = docWithVT.startViewTransition(() => {
        applyChange();
      });
      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 460,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
            },
          );
        })
        .catch(() => {
          // fallback if view transition aborted
        });
    } else {
      applyChange();
    }

    if (user?.id) {
      try {
        localStorage.setItem(`claro_theme_user_${user.id}`, nextTheme);
      } catch {
        // ignore storage errors
      }
    }
    updateUserState({ theme_preference: nextTheme });
    setIsSavingTheme(true);
    try {
      await api.put('/api/users/me/profile', { theme_preference: nextTheme });
    } catch {
      // localStorage fallback already set
    } finally {
      setIsSavingTheme(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && (!cleanEmail.includes('@') || !cleanEmail.includes('.'))) {
      setFeedback({ type: 'error', message: 'Informe um endereço de e-mail válido.' });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setFeedback({ type: 'error', message: 'A nova senha deve possuir no mínimo 6 caracteres.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setFeedback({ type: 'error', message: 'A confirmação de senha não confere.' });
        return;
      }
      if (!currentPassword) {
        setFeedback({ type: 'error', message: 'Informe sua senha atual para alterar a senha.' });
        return;
      }
    }

    setIsLoading(true);
    try {
      const res = await api.put<{ success: boolean; user: User }>('/api/users/me/profile', {
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        theme_preference: themePref,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });

      if (res.user) {
        updateUserState(res.user);
      } else {
        await refreshUser();
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setFeedback({
        type: 'success',
        message: 'Dados cadastrais e preferências atualizados com sucesso.',
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setFeedback({ type: 'error', message: err.message });
      } else {
        setFeedback({ type: 'error', message: 'Erro ao salvar alterações.' });
      }
    } finally {
      setIsLoading(false);
    }
  }

  const activeThemeMeta = THEME_OPTIONS.find((t) => t.id === themePref) || THEME_OPTIONS[0];
  const resolvedNow = resolveVisualTheme(themePref);
  const passwordLengthOk = newPassword.length >= 6;
  const passwordMatchOk = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div ref={pageRef} className="max-w-5xl mx-auto space-y-6 pb-14">
      <PageHeader
        title="Meu Perfil & Aparência"
        subtitle="Identidade corporativa, calibração visual anti-ofuscamento e segurança Zero-Trust"
      />

      {/* 1. Executive Identity & Readiness Banner */}
      <Card className="profile-stagger-card p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-white text-xl font-extrabold shrink-0 shadow-inner">
                {(formatPersonName(user?.name || user?.username) || 'U').charAt(0).toUpperCase()}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#090C13] ${
                  missing.length === 0 ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                title={missing.length === 0 ? 'Cadastro Completo' : 'Campos Pendentes'}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-extrabold tracking-[-0.02em] text-white">
                  {formatPersonName(user?.name || user?.username) || 'Usuário'}
                </h2>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-neutral-300">
                  {user?.role || 'Colaborador'}
                </span>
              </div>
              <p className="text-xs text-[#a1a1a6] mt-1 flex items-center gap-2 flex-wrap">
                <span className="mono font-semibold text-white">@{user?.username}</span>
                <span>•</span>
                <span>{user?.company || 'Claro Brasil'}</span>
                {user?.email && (
                  <>
                    <span>•</span>
                    <span className="truncate">{user.email}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Didactic Readiness & Security Telemetry Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:min-w-[410px]">
            <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="ds-eyebrow flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cadastro</span>
              </div>
              <div className="text-xs font-bold text-white mt-1 flex items-center justify-between">
                <span>{missing.length === 0 ? '100% Verificado' : `${completionPct}% Preenchido`}</span>
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="ds-eyebrow flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Tema Ativo</span>
              </div>
              <div className="text-xs font-bold text-white mt-1 truncate">
                {activeThemeMeta.title}
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="ds-eyebrow flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>Proteção 2FA</span>
              </div>
              <div className="text-xs font-bold text-white mt-1">
                {user?.totp_enabled ? 'TOTP Ativo (12h)' : 'Configuração Pendente'}
              </div>
            </div>
          </div>
        </div>

        {missing.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Para manter sua ficha operacional homologada, preencha os campos pendentes:{' '}
                <strong className="text-white">{missing.join(', ')}</strong>.
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* 2. Central de Aparência & Conforto Visual (Redesign Apple Display Studio) */}
      <Card className="profile-stagger-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 mb-5 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <span className="ds-eyebrow">Calibração de Tela • Individual por Usuário</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-neutral-300">
                Salvo na Nuvem
              </span>
            </div>
            <h3 className="text-base font-extrabold tracking-[-0.02em] text-white mt-1">
              Aparência & Conforto Visual
            </h3>
            <p className="text-xs text-[#a1a1a6] mt-1 max-w-2xl leading-relaxed">
              Escolha a calibração ideal para o seu ambiente de trabalho. O modo{' '}
              <strong className="text-white">Claro Suave (Pérola)</strong> foi projetado com tons de ardósia e cinza-pérola (sem branco puro <code className="mono">#FFFFFF</code>) para eliminar o ofuscamento e descansar a visão.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSavingTheme ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-neutral-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                Sincronizando tema...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-neutral-400">
                Renderizando: <strong className="text-white uppercase">{resolvedNow === 'light' ? 'Claro Suave' : resolvedNow === 'dim' ? 'Grafite' : 'Obsidian'}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = themePref === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={(e) => handleSelectTheme(opt.id, e)}
                aria-pressed={isSelected}
                className={`theme-studio-tile group relative p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between gap-4 cursor-pointer ${
                  isSelected
                    ? 'bg-white/[0.07] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40 shadow-lg'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/25 hover:bg-white/[0.04]'
                }`}
              >
                {/* Live Miniature UI Schematic Preview */}
                <div
                  className="w-full h-24 rounded-xl p-2.5 flex gap-2.5 overflow-hidden border transition-transform duration-300 group-hover:scale-[1.01]"
                  style={{
                    background: opt.previewBg,
                    borderColor: opt.previewBorder,
                  }}
                  aria-hidden="true"
                >
                  {/* Mini Sidebar */}
                  <div
                    className="w-12 h-full rounded-lg p-1.5 flex flex-col justify-between shrink-0"
                    style={{
                      background: opt.previewSurface,
                      border: `1px solid ${opt.previewBorder}`,
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#EE2C24] shrink-0" />
                      <span
                        className="h-1.5 w-5 rounded-full"
                        style={{ background: opt.previewText, opacity: 0.85 }}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded-full bg-[#EE2C24]/80" />
                      <div
                        className="h-1.5 w-4/5 rounded-full"
                        style={{ background: opt.previewMuted, opacity: 0.45 }}
                      />
                      <div
                        className="h-1.5 w-3/5 rounded-full"
                        style={{ background: opt.previewMuted, opacity: 0.35 }}
                      />
                    </div>
                  </div>

                  {/* Mini Main Workspace */}
                  <div className="flex-1 flex flex-col justify-between gap-1.5">
                    <div
                      className="h-7 rounded-lg px-2.5 flex items-center justify-between"
                      style={{
                        background: opt.previewSurface,
                        border: `1px solid ${opt.previewBorder}`,
                      }}
                    >
                      <span
                        className="h-2 w-16 rounded-full"
                        style={{ background: opt.previewText, opacity: 0.9 }}
                      />
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-[#EE2C24] text-white">
                        COP REDE
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 flex-1">
                      <div
                        className="rounded-lg p-2 flex flex-col justify-between"
                        style={{
                          background: opt.previewSurface,
                          border: `1px solid ${opt.previewBorder}`,
                        }}
                      >
                        <span
                          className="h-1.5 w-10 rounded-full"
                          style={{ background: opt.previewMuted, opacity: 0.6 }}
                        />
                        <span
                          className="h-2.5 w-14 rounded-full"
                          style={{ background: opt.previewText, opacity: 0.9 }}
                        />
                      </div>
                      <div
                        className="rounded-lg p-2 flex flex-col justify-between"
                        style={{
                          background: opt.previewRaised,
                          border: `1px solid ${opt.previewBorder}`,
                        }}
                      >
                        <span
                          className="h-1.5 w-12 rounded-full"
                          style={{ background: '#34d399', opacity: 0.85 }}
                        />
                        <span
                          className="h-2.5 w-10 rounded-full"
                          style={{
                            background: opt.id === 'system' ? '#1a1f29' : opt.previewText,
                            opacity: 0.9,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Theme Info & Didactic Guidance */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className="w-4 h-4 text-white shrink-0" />
                      <span className="text-sm font-extrabold text-white">{opt.title}</span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${opt.badgeClass}`}
                      >
                        {opt.badge}
                      </span>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                          : 'border-white/25'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  <p className="text-xs text-[#a1a1a6] leading-relaxed">{opt.subtitle}</p>

                  <div className="pt-2 mt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-neutral-400">{opt.recommendation}</span>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-500 flex items-center justify-between">
                    <span>{opt.luminance}</span>
                    {opt.id === 'system' && (
                      <span className="text-emerald-400">
                        SO agora: {systemIsLight ? 'Claro Suave' : 'Escuro Obsidian'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-3 border animate-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-red-500/10 border-red-500/25 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          )}
          <span className="flex-1">{feedback.message}</span>
        </div>
      )}

      {/* 3. Dados Pessoais & Alteração de Senha */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="profile-stagger-card lg:col-span-2 p-6">
            <div className="pb-4 mb-5 border-b border-white/[0.06]">
              <span className="ds-eyebrow">Ficha Operacional</span>
              <h3 className="text-sm font-extrabold text-white mt-0.5">
                Dados Pessoais e Contato
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              <Field label="Nome Completo" hint="Exibido em vistorias, relatórios e auditorias.">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                />
              </Field>

              <Field label="Identificador de Login" hint="Definido pela coordenação.">
                <Input
                  type="text"
                  disabled
                  value={user?.username || ''}
                  className="opacity-60 cursor-not-allowed mono"
                />
              </Field>

              <Field label="E-mail Corporativo" hint="Usado para alertas e comunicados oficiais.">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@claro.com.br"
                />
              </Field>

              <Field label="Telefone / WhatsApp" hint="Contato rápido para acionamento em campo.">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(21) 99999-9999"
                />
              </Field>

              <Field label="Empresa Vinculada">
                <Input
                  type="text"
                  disabled
                  value={user?.company || 'Claro'}
                  className="opacity-60 cursor-not-allowed"
                />
              </Field>

              <Field label="Cargo / Função">
                <Input
                  type="text"
                  disabled
                  value={user?.role || 'Técnico'}
                  className="opacity-60 cursor-not-allowed"
                />
              </Field>
            </div>
          </Card>

          <Card className="profile-stagger-card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/[0.06]">
                <div>
                  <span className="ds-eyebrow">Credencial Primária</span>
                  <h3 className="text-sm font-extrabold text-white mt-0.5">
                    Alterar Senha
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswords((v) => !v)}
                  className="p-2 rounded-lg bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  title={showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div>
                <Field label="Senha Atual">
                  <Input
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </Field>

                <Field label="Nova Senha">
                  <Input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </Field>

                <Field label="Confirmar Nova Senha">
                  <Input
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                  />
                </Field>
              </div>
            </div>

            {/* Didactic Password Checklist */}
            <div className="mt-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5 text-[11px]">
              <div className="font-semibold text-neutral-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-neutral-400" />
                <span>Requisitos de Segurança:</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordLengthOk ? 'text-emerald-400' : 'text-neutral-500'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Mínimo de 6 caracteres</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordMatchOk ? 'text-emerald-400' : 'text-neutral-500'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Confirmação idêntica à nova senha</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex items-center justify-end">
          <Button
            type="submit"
            disabled={isLoading}
            className="px-7"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Alterações do Perfil</span>
              </>
            )}
          </Button>
        </div>
      </form>

      {/* 4. Card 2FA - Aplicativo Autenticador */}
      <Card className="profile-stagger-card p-6">
        <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-red-600/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <span className="ds-eyebrow">Segurança Zero-Trust • RFC 6238</span>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2 flex-wrap mt-0.5">
                Aplicativo Autenticador (2FA)
                {user?.totp_enabled ? (
                  <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Ativo & Vinculado
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Pendente
                  </span>
                )}
              </h2>
              <p className="text-xs text-[#a1a1a6] mt-0.5">
                Proteção por código temporário de 6 dígitos (Google Authenticator ou Microsoft Authenticator) com validade de sessão de 12 horas.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02] p-4 rounded-xl border border-white/[0.06]">
          <div className="text-xs text-[#a1a1a6] space-y-1">
            <p>
              <strong className="text-white">Status da Sessão Atual:</strong>{' '}
              {user?.totp_verified ? 'Validada e autorizada por 12 horas' : 'Aguardando validação'}
            </p>
            <p className="text-[11px] text-neutral-500">
              Trocou de aparelho celular? Reconfigure seu QR Code informando sua senha de acesso abaixo.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const pwd = prompt(
                'Para sua segurança, digite sua senha de acesso para confirmar a reconfiguração do autenticador:',
              );
              if (pwd === null) return;
              if (!pwd.trim()) {
                alert('A senha de acesso é obrigatória para redefinir o autenticador.');
                return;
              }
              try {
                await api.post('/api/auth/totp/reconfigure', { password: pwd.trim() });
                updateUserState({ totp_enabled: false, totp_verified: false, requires_totp_setup: true });
              } catch {
                alert('Erro ao redefinir autenticador. Verifique se a senha informada está correta.');
              }
            }}
            className="text-xs py-2 px-4 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recadastrar Autenticador</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
