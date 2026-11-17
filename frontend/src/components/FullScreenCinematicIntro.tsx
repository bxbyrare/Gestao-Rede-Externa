import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface FullScreenCinematicIntroProps {
  onComplete?: () => void;
  durationMs?: number;
}

export default function FullScreenCinematicIntro({
  onComplete,
  durationMs = 4100,
}: FullScreenCinematicIntroProps) {
  // Check if user has already seen the intro in this session
  const alreadySeen = typeof window !== 'undefined' && sessionStorage.getItem('claro_intro_dismissed') === 'true';

  const [phase, setPhase] = useState<'playing' | 'dissolve' | 'hidden'>(alreadySeen ? 'hidden' : 'playing');
  const [isMutedByPolicy, setIsMutedByPolicy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const completedRef = useRef(alreadySeen);

  function finishIntro() {
    if (completedRef.current) return;
    completedRef.current = true;
    try {
      sessionStorage.setItem('claro_intro_dismissed', 'true');
    } catch {
      // ignore
    }
    setPhase('dissolve');
    setTimeout(() => {
      setPhase('hidden');
      if (onComplete) onComplete();
    }, 450);
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
    if (alreadySeen) return;

    const vid = videoRef.current;
    if (vid) {
      const initialPlay = vid.play();
      if (initialPlay !== undefined) {
        initialPlay
          .then(() => {
            vid.muted = false;
            vid.volume = 1.0;
            const unmuteAttempt = vid.play();
            if (unmuteAttempt !== undefined) {
              unmuteAttempt
                .then(() => {
                  setIsMutedByPolicy(false);
                })
                .catch(() => {
                  vid.muted = true;
                  vid.play().catch(() => {});
                  setIsMutedByPolicy(true);
                });
            }
          })
          .catch(() => {
            vid.muted = true;
            vid.play().catch(() => {
              finishIntro();
            });
            setIsMutedByPolicy(true);
          });
      }
    }

    // Global audio unlock on user gesture
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

    // Strict fast transition timer: ends automatically after durationMs
    const fallbackTimer = setTimeout(() => {
      finishIntro();
    }, durationMs);

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('pointerdown', unlockAudioOnInteraction);
      window.removeEventListener('keydown', unlockAudioOnInteraction);
      window.removeEventListener('touchstart', unlockAudioOnInteraction);
    };
  }, [durationMs, alreadySeen]);

  if (phase === 'hidden' || alreadySeen) return null;

  return (
    <div
      className={`fixed inset-0 z-[1000] flex items-center justify-center select-none overflow-hidden transition-all duration-500 ${
        phase === 'dissolve'
          ? 'opacity-0 scale-[1.02] filter blur-sm pointer-events-none'
          : 'opacity-100 scale-100 filter-none pointer-events-auto'
      }`}
      style={{
        background: '#030305',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <video
        ref={videoRef}
        src="/claro-orb-intro.mp4?v=20261117a"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finishIntro}
        onError={() => finishIntro()}
        className="w-full h-full object-cover object-center pointer-events-none"
      />

      {/* Audio toggle */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2">
        {isMutedByPolicy ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              enableAudio();
            }}
            className="px-3.5 py-2 rounded-full bg-[#0a0d14]/85 hover:bg-[#141b26]/95 border border-rose-500/40 text-xs font-medium text-white flex items-center gap-2 backdrop-blur-md shadow-xl shadow-black/60 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <VolumeX className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>Ativar som</span>
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
            className="w-9 h-9 rounded-full bg-[#0a0d14]/80 hover:bg-[#141b26] border border-white/20 text-neutral-200 flex items-center justify-center backdrop-blur-md shadow-lg shadow-black/50 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-emerald-400" />
          </button>
        )}
      </div>
    </div>
  );
}
