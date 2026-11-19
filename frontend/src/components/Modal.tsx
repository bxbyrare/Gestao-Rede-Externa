import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    let ctx: gsap.Context | null = null;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ctx = gsap.context(() => {
        if (backdropRef.current) {
          gsap.fromTo(
            backdropRef.current,
            { opacity: 0 },
            { opacity: 1, duration: 0.28, ease: 'power2.out' },
          );
        }
        if (dialogRef.current) {
          gsap.fromTo(
            dialogRef.current,
            { opacity: 0, scale: 0.95, y: 18 },
            { opacity: 1, scale: 1, y: 0, duration: 0.42, ease: 'power4.out' },
          );
        }
      });
    }

    return () => {
      ctx?.revert();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${maxWidth} rounded-t-[28px] sm:rounded-[28px] p-[1px] bg-gradient-to-b from-white/[0.16] via-white/[0.05] to-white/[0.02] border border-white/[0.08] max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-[0_28px_70px_rgba(0,0,0,0.88)] backdrop-blur-3xl z-10 overflow-hidden`}
      >
        <div className="rounded-t-[27px] sm:rounded-[27px] bg-[#090C13]/98 flex flex-col flex-1 overflow-hidden border border-white/[0.05]">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
            <h3 className="font-bold text-base tracking-[-0.02em] text-white">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 -mr-2 text-neutral-400 hover:text-white transition-colors rounded-xl hover:bg-white/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5 flex-1 text-neutral-200">{children}</div>
          {footer && (
            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3 justify-end shrink-0 bg-[#06080D]/60">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
