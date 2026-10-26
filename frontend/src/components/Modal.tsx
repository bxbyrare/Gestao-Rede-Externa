import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${maxWidth} rounded-t-[28px] sm:rounded-[28px] p-[1px] bg-gradient-to-b from-white/[0.14] via-white/[0.04] to-white/[0.02] border border-white/[0.08] max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-3xl animate-in z-10 overflow-hidden`}
      >
        <div className="rounded-t-[27px] sm:rounded-[27px] bg-[#090C13]/98 flex flex-col flex-1 overflow-hidden border border-white/[0.05]">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
            <h3 className="font-bold text-base text-white">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 -mr-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5 flex-1 text-neutral-200">{children}</div>
          {footer && <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3 justify-end shrink-0 bg-[#06080D]/60">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
