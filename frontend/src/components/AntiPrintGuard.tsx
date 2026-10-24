import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../state/AuthContext';

export default function AntiPrintGuard() {
  const { user } = useAuth();
  const [shieldActive, setShieldActive] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardLockedRef = useRef(false);

  useEffect(() => {
    function clearClipboard() {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('').catch(() => {});
        }
      } catch {
        // ignore
      }
    }

    function triggerHardShield(reason: string, durationMs = 2800) {
      hardLockedRef.current = true;
      setAlertMessage(reason);
      setShieldActive(true);
      clearClipboard();

      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
      lockTimerRef.current = setTimeout(() => {
        hardLockedRef.current = false;
        if (document.hasFocus() && !document.hidden) {
          setShieldActive(false);
          setAlertMessage(null);
        }
      }, durationMs);
    }

    function onKeyDown(e: KeyboardEvent) {
      const key = (e.key || '').toLowerCase();
      const code = (e.code || '').toLowerCase();

      // PrintScreen (PC)
      if (
        key === 'printscreen' ||
        code === 'printscreen' ||
        e.keyCode === 44
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardShield('Captura de tela bloqueada.');
        return;
      }

      // Windows Snipping Tool (Win + Shift + S) or macOS Screenshot (Cmd + Shift + 3/4/5/6)
      if (
        (e.metaKey && e.shiftKey && ['s', '3', '4', '5', '6'].includes(key)) ||
        (e.ctrlKey && e.shiftKey && ['s', '3', '4', '5'].includes(key)) ||
        (e.altKey && (key === 'printscreen' || e.keyCode === 44))
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardShield('Captura de tela bloqueada.');
        return;
      }

      // Meta / Windows Key alone (prevents Win+Shift+S or Win+PrtScn before OS grabs focus)
      if (key === 'meta' || key === 'os') {
        setShieldActive(true);
        return;
      }

      // Ctrl/Cmd + P (Print) or Ctrl/Cmd + S (Save page) or Ctrl/Cmd + U (View source)
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'u'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardShield('Impressão e exportação de tela bloqueadas.');
        return;
      }

      // DevTools shortcuts (F12, Ctrl+Shift+I/J/C)
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardShield('Inspeção de página desativada.');
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const key = (e.key || '').toLowerCase();
      const code = (e.code || '').toLowerCase();

      if (
        key === 'printscreen' ||
        code === 'printscreen' ||
        e.keyCode === 44
      ) {
        e.preventDefault();
        triggerHardShield('Captura de tela bloqueada.');
        return;
      }

      if (key === 'meta' || key === 'os') {
        if (!hardLockedRef.current && document.hasFocus() && !document.hidden) {
          setShieldActive(false);
        }
      }
    }

    function onVisibilityChange() {
      if (document.hidden || document.visibilityState !== 'visible') {
        setShieldActive(true);
      } else if (!hardLockedRef.current && document.hasFocus()) {
        setShieldActive(false);
        setAlertMessage(null);
      }
    }

    function onWindowBlur() {
      // Instantaneously hide sensitive data when Snipping Tool, Lightshot,
      // iOS/Android Control Center, or App Switcher takes focus
      setShieldActive(true);
    }

    function onWindowFocus() {
      if (!hardLockedRef.current && !document.hidden) {
        setShieldActive(false);
        setAlertMessage(null);
      }
    }

    // Mobile multi-finger screenshot gestures (3-finger swipe on Android/iOS)
    function onTouchStart(e: TouchEvent) {
      if (e.touches && e.touches.length >= 3) {
        triggerHardShield('Captura de tela bloqueada no dispositivo móvel.');
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches && e.touches.length >= 3) {
        triggerHardShield('Captura de tela bloqueada no dispositivo móvel.');
      }
    }

    // Touch cancel often fires on Android/iOS when system intercepts gesture for screenshot
    function onTouchCancel() {
      triggerHardShield('Conteúdo protegido contra captura.', 1500);
    }

    function isEditableElement(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      );
    }

    function onContextMenu(e: MouseEvent) {
      if (!isEditableElement(e.target)) {
        e.preventDefault();
      }
    }

    function onCopy(e: ClipboardEvent) {
      if (!isEditableElement(e.target)) {
        e.preventDefault();
      }
    }

    function onBeforePrint() {
      triggerHardShield('Impressão de página bloqueada.');
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onWindowBlur, true);
    window.addEventListener('focus', onWindowFocus, true);
    window.addEventListener('beforeprint', onBeforePrint, true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true, capture: true });
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('copy', onCopy, true);

    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onWindowBlur, true);
      window.removeEventListener('focus', onWindowFocus, true);
      window.removeEventListener('beforeprint', onBeforePrint, true);
      document.removeEventListener('visibilitychange', onVisibilityChange, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchcancel', onTouchCancel, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('copy', onCopy, true);
    };
  }, []);

  const watermarkLabel = user
    ? `${user.username} • ${new Date().toLocaleDateString('pt-BR')}`
    : 'ACESSO RESTRITO';

  return (
    <>
      {/* Subtle dynamic watermark across the screen to deter external camera photos */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[85] overflow-hidden select-none"
        style={{ opacity: 0.028 }}
      >
        <div className="w-[150vw] h-[150vh] -translate-x-[15vw] -translate-y-[15vh] -rotate-12 flex flex-wrap content-start gap-x-16 gap-y-14">
          {Array.from({ length: 48 }).map((_, idx) => (
            <span
              key={idx}
              className="text-xs font-mono font-bold uppercase tracking-widest text-white whitespace-nowrap"
            >
              {watermarkLabel}
            </span>
          ))}
        </div>
      </div>

      {/* Instant 0ms blackout curtain triggered on screenshot keys, snipping tools, or focus loss */}
      {shieldActive && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed inset-0 z-[99999] bg-[#08080a] flex flex-col items-center justify-center p-6 text-center select-none"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-300 mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white mb-1">
            Conteúdo Protegido
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
            {alertMessage ||
              'A visualização foi ocultada para proteção dos dados. Clique na janela para continuar.'}
          </p>
        </div>
      )}
    </>
  );
}
