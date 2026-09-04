import { useState, useEffect, useCallback } from 'react';
import { Maximize2, Download, ExternalLink, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface GalleryItem {
  url: string;
  title?: string;
  subtitle?: string;
  description?: string;
}

interface AccordionGalleryProps {
  images: (string | GalleryItem)[];
  defaultActiveIndex?: number;
  className?: string;
  height?: string;
  showCounter?: boolean;
}

export default function AccordionGallery({
  images,
  defaultActiveIndex = 0,
  className = '',
  height = 'h-64 sm:h-72',
  showCounter = true,
}: AccordionGalleryProps) {
  const normalizedItems: GalleryItem[] = (images || [])
    .filter(Boolean)
    .map((img, idx) => {
      if (typeof img === 'string') {
        return {
          url: img,
          title: `Evidência ${idx + 1}`,
          subtitle: `Foto ${idx + 1} de ${images.length}`,
        };
      }
      return {
        ...img,
        title: img.title || `Evidência ${idx + 1}`,
        subtitle: img.subtitle || `Foto ${idx + 1} de ${images.length}`,
      };
    });

  const [activeIndex, setActiveIndex] = useState(
    defaultActiveIndex >= 0 && defaultActiveIndex < normalizedItems.length ? defaultActiveIndex : 0
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const total = normalizedItems.length;

  // Lightbox navigation
  const openLightbox = (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLightboxIndex(idx);
    setZoomLevel(1);
  };

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    setZoomLevel(1);
  }, []);

  const nextImage = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setLightboxIndex((prev) => (prev !== null ? (prev + 1) % total : 0));
      setZoomLevel(1);
    },
    [total]
  );

  const prevImage = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setLightboxIndex((prev) => (prev !== null ? (prev - 1 + total) % total : total - 1));
      setZoomLevel(1);
    },
    [total]
  );

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [lightboxIndex, closeLightbox, nextImage, prevImage]);

  if (total === 0) return null;

  // Single Image Layout
  if (total === 1) {
    const item = normalizedItems[0];
    return (
      <div className={`relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 group ${className}`}>
        <div className={`relative w-full ${height} overflow-hidden cursor-pointer`} onClick={() => openLightbox(0)}>
          <img
            src={item.url}
            alt={item.title || 'Foto'}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
            <div>
              <p className="text-xs font-bold text-white drop-shadow">{item.title}</p>
              {item.subtitle && <p className="text-[11px] text-white/70 drop-shadow">{item.subtitle}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => openLightbox(0, e)}
                className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                title="Ampliar foto"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                title="Abrir original"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
        {lightboxIndex !== null && renderLightbox()}
      </div>
    );
  }

  // React Bits Accordion Gallery (2+ images)
  return (
    <div className={`w-full ${className}`}>
      <div
        className={`flex w-full ${height} gap-2 sm:gap-3 rounded-2xl overflow-hidden p-1 bg-black/30 border border-white/10 backdrop-blur-sm select-none`}
      >
        {normalizedItems.map((item, idx) => {
          const isExpanded = activeIndex === idx;

          return (
            <div
              key={idx}
              onClick={() => setActiveIndex(idx)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`relative h-full rounded-xl overflow-hidden cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] group ${
                isExpanded
                  ? 'flex-[5] sm:flex-[6] shadow-xl ring-1 ring-[var(--color-primary)]/50'
                  : 'flex-1 min-w-[48px] sm:min-w-[60px] opacity-75 hover:opacity-100'
              }`}
            >
              {/* Background Image */}
              <img
                src={item.url}
                alt={item.title || `Foto ${idx + 1}`}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                loading="lazy"
              />

              {/* Gradient Overlays */}
              <div
                className={`absolute inset-0 transition-opacity duration-500 ${
                  isExpanded
                    ? 'bg-gradient-to-t from-black/90 via-black/30 to-black/10'
                    : 'bg-black/55 group-hover:bg-black/35'
                }`}
              />

              {/* Expanded Card Content */}
              <div
                className={`absolute inset-0 p-3 sm:p-4 flex flex-col justify-between transition-all duration-500 ${
                  isExpanded ? 'opacity-100 translate-y-0 delay-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {/* Top Badge */}
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-bold text-white flex items-center gap-1.5 shadow">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse" />
                    {showCounter ? `${idx + 1} / ${total}` : item.title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => openLightbox(idx, e)}
                      className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-[var(--color-primary)] hover:border-transparent transition-all shadow"
                      title="Visualizar em tela cheia"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all shadow"
                      title="Abrir em nova guia"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Bottom Details */}
                <div className="bg-black/60 backdrop-blur-md rounded-xl p-2.5 sm:p-3 border border-white/10 shadow-lg">
                  <h5 className="font-bold text-xs sm:text-sm text-white leading-tight drop-shadow">{item.title}</h5>
                  {item.subtitle && (
                    <p className="text-[10px] sm:text-xs text-white/70 mt-0.5 font-medium drop-shadow">{item.subtitle}</p>
                  )}
                  {item.description && (
                    <p className="text-[10px] text-white/60 mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
              </div>

              {/* Collapsed Card Badge */}
              {!isExpanded && (
                <div className="absolute inset-0 flex flex-col items-center justify-between py-3 pointer-events-none">
                  <span className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-bold text-white flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 drop-shadow">
                    Foto {idx + 1}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && renderLightbox()}
    </div>
  );

  function renderLightbox() {
    if (lightboxIndex === null) return null;
    const current = normalizedItems[lightboxIndex];

    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in">
        {/* Top Controls Bar */}
        <div className="absolute top-0 inset-x-0 p-4 sm:p-6 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-bold text-white">
              {lightboxIndex + 1} de {total}
            </span>
            <div>
              <h4 className="text-sm font-bold text-white">{current.title}</h4>
              {current.subtitle && <p className="text-xs text-white/60">{current.subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-colors cursor-pointer"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-colors cursor-pointer"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <a
              href={current.url}
              download
              target="_blank"
              rel="noreferrer"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-colors"
              title="Baixar Foto"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={closeLightbox}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-[var(--color-danger)] border border-white/15 flex items-center justify-center text-white transition-colors cursor-pointer"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Center Image Container */}
        <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12 overflow-hidden" onClick={closeLightbox}>
          <img
            src={current.url}
            alt={current.title}
            style={{ transform: `scale(${zoomLevel})` }}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl transition-transform duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Prev / Next Buttons */}
        {total > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all shadow-xl hover:scale-110 cursor-pointer"
              title="Foto anterior (Seta esquerda)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all shadow-xl hover:scale-110 cursor-pointer"
              title="Próxima foto (Seta direita)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Bottom Thumbnail Strip */}
        {total > 1 && (
          <div className="absolute bottom-4 inset-x-0 flex justify-center z-20 pointer-events-none">
            <div className="flex items-center gap-2 p-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 pointer-events-auto max-w-[90vw] overflow-x-auto">
              {normalizedItems.map((thumb, tIdx) => (
                <button
                  key={tIdx}
                  onClick={() => {
                    setLightboxIndex(tIdx);
                    setZoomLevel(1);
                  }}
                  className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                    lightboxIndex === tIdx
                      ? 'border-[var(--color-primary)] scale-105 opacity-100 ring-2 ring-[var(--color-primary)]/40'
                      : 'border-transparent opacity-50 hover:opacity-80'
                  }`}
                >
                  <img src={thumb.url} alt={`Thumb ${tIdx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>,
      document.body
    );
  }
}