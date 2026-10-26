import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';

export default function AntiPrintGuard() {
  const [shieldActive, setShieldActive] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    function triggerHardShield(reason: string, durationMs = 2000) {
      setAlertMessage(reason);
      setShieldActive(true);
      clearClipboard();

      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
      lockTimerRef.current = setTimeout(() => {
        setShieldActive(false);
        setAlertMessage(null);
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
        (e.altKey && (key === 'printscreen' || e.keyCode === 44))
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardShield('Captura de tela bloqueada.');
        return;
      }

      // Ctrl/Cmd + P (Print)
      if ((e.ctrlKey || e.metaKey) && key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        triggerHardShield('Impressão de página bloqueada.');
        return;
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
    window.addEventListener('beforeprint', onBeforePrint, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('copy', onCopy, true);

    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('beforeprint', onBeforePrint, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('copy', onCopy, true);
    };
  }, []);

  if (!shieldActive) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      onClick={() => {
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
        setShieldActive(false);
        setAlertMessage(null);
      }}
      className="fixed inset-0 z-[99999] bg-[#030305] flex flex-col items-center justify-center p-6 text-center select-none cursor-pointer"
    >
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-300 mb-4">
        <Lock className="w-5 h-5" />
      </div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-white mb-1">
        Conteúdo Protegido
      </h2>
      <p className="text-xs text-neutral-400 max-w-xs">
        {alertMessage || 'Captura de tela bloqueada.'}
      </p>
    </div>
  );
}
