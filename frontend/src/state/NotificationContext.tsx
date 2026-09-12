import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Star, BarChart3, BellRing, X, ExternalLink
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

export interface LiveAlert {
  id: number | string;
  category: 'auditoria' | 'avaliacao' | 'indicadores' | 'sistema';
  title: string;
  message: string;
  link?: string;
  time?: string;
  created_at?: string;
}

interface NotificationContextValue {
  alerts: LiveAlert[];
  toasts: LiveAlert[];
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  playBip: () => void;
  notify: (alert: Omit<LiveAlert, 'id'> & { id?: number | string }) => void;
  dismissToast: (id: number | string) => void;
  clearAllToasts: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

// Web Audio API notification chime generator (Bip duplo agradável / social media style)
function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Primeiro tom: 880 Hz (Lá / A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // Segundo tom: 1318.5 Hz (Mi / E6) - acorde harmônico perfeito
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.36);
  } catch (err) {
    console.warn('In-app notification audio error:', err);
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [toasts, setToasts] = useState<LiveAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('notifications_sound_enabled') !== 'false';
  });

  const latestIdRef = useRef<number>(0);
  const isFirstFetchRef = useRef<boolean>(true);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const playBip = useCallback(() => {
    if (soundEnabledRef.current) {
      playNotificationChime();
    }
  }, []);

  const dismissToast = useCallback((id: number | string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const notify = useCallback(
    (newAlert: Omit<LiveAlert, 'id'> & { id?: number | string }) => {
      const alertItem: LiveAlert = {
        ...newAlert,
        id: newAlert.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        time: newAlert.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setToasts((prev) => [alertItem, ...prev.slice(0, 4)]);
      setAlerts((prev) => [alertItem, ...prev.slice(0, 49)]);
      playBip();
    },
    [playBip]
  );

  // Poll live alerts from backend every 6 seconds
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    async function pollAlerts() {
      try {
        const sinceId = latestIdRef.current;
        const res = await api.get<{ alerts: LiveAlert[]; latest_id: number }>('/api/live-alerts', {
          since_id: sinceId,
        });

        if (!isMounted || !res) return;

        if (isFirstFetchRef.current) {
          // On first load, initialize latest_id without spamming alerts from the past
          isFirstFetchRef.current = false;
          latestIdRef.current = res.latest_id || 0;
          if (res.alerts && res.alerts.length > 0) {
            setAlerts(res.alerts);
          }
          return;
        }

        if (res.alerts && res.alerts.length > 0) {
          latestIdRef.current = res.latest_id || latestIdRef.current;
          
          // Trigger toasts & bip
          setToasts((prev) => [...res.alerts, ...prev].slice(0, 5));
          setAlerts((prev) => [...res.alerts, ...prev].slice(0, 50));
          playBip();
        }
      } catch {
        // Silently catch network errors during polling
      }
    }

    // Initial check
    pollAlerts();
    const interval = setInterval(pollAlerts, 6000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, playBip]);

  function handleSetSound(val: boolean) {
    setSoundEnabled(val);
    localStorage.setItem('notifications_sound_enabled', val ? 'true' : 'false');
    if (val) {
      playNotificationChime();
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        alerts,
        toasts,
        soundEnabled,
        setSoundEnabled: handleSetSound,
        playBip,
        notify,
        dismissToast,
        clearAllToasts,
      }}
    >
      {children}
      <NotificationToaster toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}

// --------------------------------------------------------------------------
// NOTIFICATION TOAST CONTAINER (BOTTOM-RIGHT CORNER / CANTO INFERIOR DIREITO)
// --------------------------------------------------------------------------

function NotificationToaster({
  toasts,
  onDismiss,
}: {
  toasts: LiveAlert[];
  onDismiss: (id: number | string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[99999] pointer-events-none flex flex-col-reverse gap-3 max-w-sm w-[92vw] sm:w-[380px]"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: LiveAlert;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(100);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    const duration = 7000;
    const intervalTime = 50;
    const step = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isHovered, onDismiss]);

  const config = getCategoryConfig(toast.category);
  const Icon = config.icon;

  function handleClick() {
    if (toast.link) {
      navigate(toast.link);
      onDismiss();
    }
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-2xl p-4 shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100 backdrop-blur-2xl border ${config.cardBorder} ${config.cardBg} group`}
      style={{
        boxShadow: '0 16px 40px -8px rgba(0, 0, 0, 0.7), 0 0 20px -2px ' + config.glowColor,
      }}
    >
      {/* Top Row: Category Icon, Badge, Timestamp and Close */}
      <div className="flex items-start justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg} ${config.iconColor} shadow-inner`}>
            <Icon className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${config.badgeBg} ${config.badgeText}`}>
              {config.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {toast.time && (
            <span className="text-[10px] text-[var(--color-text-faint)] font-mono">
              {toast.time}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="p-1 rounded-lg text-[var(--color-text-faint)] hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar notificação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content (Clickable) */}
      <div
        onClick={handleClick}
        className={`${toast.link ? 'cursor-pointer hover:opacity-90' : ''} transition-opacity`}
      >
        <h4 className="text-sm font-black text-white leading-tight mb-1 flex items-center gap-1.5">
          <span>{toast.title}</span>
          {toast.link && <ExternalLink className="w-3 h-3 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity" />}
        </h4>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-3">
          {toast.message}
        </p>

        {toast.link && (
          <div className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary)]">
            <span>Clique para abrir</span>
            <span>&rarr;</span>
          </div>
        )}
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
        <div
          className={`h-full transition-all duration-75 ${config.progressBg}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function getCategoryConfig(category: LiveAlert['category']) {
  switch (category) {
    case 'auditoria':
      return {
        label: 'Auditoria OS',
        icon: ShieldCheck,
        cardBg: 'bg-[#111624]/95',
        cardBorder: 'border-sky-500/30',
        iconBg: 'bg-sky-500/20',
        iconColor: 'text-sky-400',
        badgeBg: 'bg-sky-500/20',
        badgeText: 'text-sky-300',
        glowColor: 'rgba(14, 165, 233, 0.25)',
        progressBg: 'bg-sky-500',
      };
    case 'avaliacao':
      return {
        label: 'Avaliação',
        icon: Star,
        cardBg: 'bg-[#121c16]/95',
        cardBorder: 'border-emerald-500/30',
        iconBg: 'bg-emerald-500/20',
        iconColor: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/20',
        badgeText: 'text-emerald-300',
        glowColor: 'rgba(16, 185, 129, 0.25)',
        progressBg: 'bg-emerald-500',
      };
    case 'indicadores':
      return {
        label: 'Indicadores',
        icon: BarChart3,
        cardBg: 'bg-[#1a1325]/95',
        cardBorder: 'border-purple-500/30',
        iconBg: 'bg-purple-500/20',
        iconColor: 'text-purple-400',
        badgeBg: 'bg-purple-500/20',
        badgeText: 'text-purple-300',
        glowColor: 'rgba(168, 85, 247, 0.25)',
        progressBg: 'bg-purple-500',
      };
    case 'sistema':
    default:
      return {
        label: 'Atenção / Notificação',
        icon: BellRing,
        cardBg: 'bg-[#1f1214]/95',
        cardBorder: 'border-red-500/30',
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-400',
        badgeBg: 'bg-red-500/20',
        badgeText: 'text-red-300',
        glowColor: 'rgba(239, 68, 68, 0.25)',
        progressBg: 'bg-[var(--color-primary)]',
      };
  }
}
