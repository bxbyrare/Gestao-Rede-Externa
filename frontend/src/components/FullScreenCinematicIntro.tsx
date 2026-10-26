import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface FullScreenCinematicIntroProps {
  onComplete?: () => void;
  durationMs?: number;
}

export default function FullScreenCinematicIntro({
  onComplete,
  durationMs = 4200,
}: FullScreenCinematicIntroProps) {
  const [phase, setPhase] = useState<'playing' | 'dissolve' | 'hidden'>('playing');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isMutedByPolicy, setIsMutedByPolicy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const completedRef = useRef(false);

  function finishIntro() {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('dissolve');
    setTimeout(() => {
      setPhase('hidden');
      if (onComplete) onComplete();
    }, 600);
  }

  function enableAudio() {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = false;
    vid.volume = 1.0;
    setIsMutedByPolicy(false);
    vid.play().catch(() => {});
  }

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) {
      // Begin playing immediately (muted attribute in JSX guarantees browser accepts playback)
      const initialPlay = vid.play();
      if (initialPlay !== undefined) {
        initialPlay
          .then(() => {
            setIsVideoReady(true);
            // Attempt to unmute if browser allows it without user gesture
            vid.muted = false;
            vid.volume = 1.0;
            const unmuteAttempt = vid.play();
            if (unmuteAttempt !== undefined) {
              unmuteAttempt
                .then(() => {
                  setIsMutedByPolicy(false);
                })
                .catch(() => {
                  // Browser policy blocked unmuted autoplay: restore muted so video keeps rolling
                  vid.muted = true;
                  vid.play().catch(() => {});
                  setIsMutedByPolicy(true);
                });
            }
          })
          .catch(() => {
            // If even initial play failed (e.g. extreme battery saver), retry muted
            vid.muted = true;
            vid.play().catch(() => {
              // If video completely cannot play, finish intro gracefully
              finishIntro();
            });
            setIsMutedByPolicy(true);
          });
      }
    }

    // Global unlock: first tap, click, or keypress anywhere instantly unmutes the sound
    const unlockAudioOnInteraction = () => {
      const v = videoRef.current;
      if (v && v.muted) {
        v.muted = false;
        v.volume = 1.0;
        setIsMutedByPolicy(false);
        v.play().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', unlockAudioOnInteraction, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudioOnInteraction, { once: true, passive: true });
    window.addEventListener('touchstart', unlockAudioOnInteraction, { once: true, passive: true });

    // Fallback safety timer so the user is never stuck
    const fallbackTimer = setTimeout(() => {
      finishIntro();
    }, durationMs + 400);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        finishIntro();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('pointerdown', unlockAudioOnInteraction);
      window.removeEventListener('keydown', unlockAudioOnInteraction);
      window.removeEventListener('touchstart', unlockAudioOnInteraction);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [durationMs]);

  if (phase === 'hidden') return null;

  return (
    <div
      onClick={() => {
        if (isMutedByPolicy) {
          enableAudio();
        }
      }}
      className={`fixed inset-0 z-[1000] flex items-center justify-center select-none overflow-hidden transition-all duration-700 ${
        phase === 'dissolve'
          ? 'opacity-0 scale-[1.03] filter blur-sm pointer-events-none'
          : 'opacity-100 scale-100 filter-none pointer-events-auto'
      }`}
      style={{
        background: 'radial-gradient(ellipse at center, #140d12 0%, #08090d 60%, #040507 100%)',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <video
        ref={videoRef}
        src="/claro-orb-intro.mp4?v=20261026b"
        autoPlay
        muted
        playsInline
        preload="auto"
        onCanPlay={() => setIsVideoReady(true)}
        onLoadedData={() => setIsVideoReady(true)}
        onEnded={finishIntro}
        onError={() => finishIntro()}
        className={`w-full h-full object-cover object-center pointer-events-none transition-opacity duration-300 ${
          isVideoReady ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Top-Right Clean Skip Button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            finishIntro();
          }}
          aria-label="Pular introdução"
          title="Pular introdução (ESC)"
          className="px-3.5 py-1.5 rounded-full bg-[#0a0d14]/75 hover:bg-[#141b26]/90 border border-white/15 text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 backdrop-blur-md shadow-lg shadow-black/40 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span>Pular</span>
          <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono">ESC</span>
        </button>
      </div>

      {/* Audio toggle / unmute indicator if browser blocked unmuted autoplay */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2">
        {isMutedByPolicy ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              enableAudio();
            }}
            className="px-3.5 py-2 rounded-full bg-[#0a0d14]/85 hover:bg-[#141b26]/95 border border-rose-500/30 hover:border-rose-500/50 text-xs font-medium text-white flex items-center gap-2 backdrop-blur-md shadow-xl shadow-black/60 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <VolumeX className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>Toque para ativar o som</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const v = videoRef.current;
              if (v) {
                v.muted = !v.muted;
                setIsMutedByPolicy(v.muted);
              }
            }}
            aria-label="Alternar áudio"
            className="w-9 h-9 rounded-full bg-[#0a0d14]/75 hover:bg-[#141b26]/90 border border-white/15 text-neutral-300 hover:text-white flex items-center justify-center backdrop-blur-md shadow-lg shadow-black/40 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-emerald-400" />
          </button>
        )}
      </div>
    </div>
  );
}
