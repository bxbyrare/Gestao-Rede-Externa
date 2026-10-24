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
    }, 650);
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
      vid.currentTime = 0;
      vid.volume = 1.0;
      vid.muted = false;

      // Attempt unmuted autoplay first so the video's built-in sound plays immediately
      vid.play().catch(() => {
        // Browser blocked unmuted autoplay on cold reload: start playing immediately
        // and unmute on first pointer/key/touch interaction
        if (!vid) return;
        vid.muted = true;
        setIsMutedByPolicy(true);
        vid.play().catch(() => {});
      });
    }

    const unlockAudioOnInteraction = () => {
      const v = videoRef.current;
      if (v && v.muted) {
        v.muted = false;
        v.volume = 1.0;
        setIsMutedByPolicy(false);
        v.play().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', unlockAudioOnInteraction, { once: true });
    window.addEventListener('keydown', unlockAudioOnInteraction, { once: true });
    window.addEventListener('touchstart', unlockAudioOnInteraction, { once: true });

    const fallbackTimer = setTimeout(() => {
      finishIntro();
    }, durationMs + 400);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
      className={`fixed inset-0 z-[1000] bg-[#09090b] flex items-center justify-center select-none overflow-hidden transition-all duration-700 ${
        phase === 'dissolve'
          ? 'opacity-0 scale-[1.03] filter blur-sm pointer-events-none'
          : 'opacity-100 scale-100 filter-none pointer-events-auto'
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <video
        ref={videoRef}
        src="/claro-orb-intro.mp4?v=20261024"
        autoPlay
        playsInline
        preload="auto"
        onEnded={finishIntro}
        className="w-full h-full object-cover object-center pointer-events-none"
      />

      {/* Audio toggle / unmute indicator if browser blocked unmuted autoplay */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2">
        {isMutedByPolicy ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              enableAudio();
            }}
            className="px-3.5 py-2 rounded-xl bg-black/70 hover:bg-black/90 border border-white/15 text-xs font-medium text-white flex items-center gap-2 backdrop-blur-md transition-colors cursor-pointer"
          >
            <VolumeX className="w-4 h-4 text-red-400" />
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
            className="w-9 h-9 rounded-xl bg-black/50 hover:bg-black/80 border border-white/10 text-neutral-300 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Invisible hotspot over the top-right 'PULAR' area in the video */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          finishIntro();
        }}
        aria-label="Pular introdução"
        title="Pular introdução (ESC)"
        className="absolute top-3 right-3 w-36 h-12 z-20 opacity-0 cursor-pointer"
      />
    </div>
  );
}
