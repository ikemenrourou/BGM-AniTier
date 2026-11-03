import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AnimeItem } from '../types';

export type StudioEntrancePhase = 'focus' | 'commentary' | 'flying' | 'landing' | 'settled';

interface StudioEntranceProps {
  anime: AnimeItem;
  poolPosters: React.RefObject<Map<number, HTMLDivElement>>;
  tierPoster: React.RefObject<HTMLDivElement | null>;
  onPhaseChange: (phase: StudioEntrancePhase) => void;
}

/** One poster travels between measured DOM positions, outside the scrolling containers. */
export const StudioEntrance: React.FC<StudioEntranceProps> = ({
  anime, poolPosters, tierPoster, onPhaseChange,
}) => {
  const posterRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const overlay = posterRef.current;
    const source = poolPosters.current.get(anime.id);
    const destination = tierPoster.current;
    if (!overlay || !source || !destination) {
      onPhaseChange('settled');
      return;
    }
    onPhaseChange('focus');

    let cancelled = false;
    let waitTimer: ReturnType<typeof setTimeout>;
    let landingTimer: ReturnType<typeof setTimeout>;
    const animations: Animation[] = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      onPhaseChange('settled');
      return;
    }
    // NEXT always stays first even after the viewer has browsed farther down the pool.
    const poolScroller = source.parentElement?.parentElement;
    if (poolScroller) poolScroller.scrollTop = 0;
    const from = source.getBoundingClientRect();
    const pool = source.closest('[data-testid="studio-candidate-pool"]')!.getBoundingClientRect();
    // Use untransformed dimensions so the last frame matches the emphasized
    // poster in the tier row, including its corner radius, without a size jump.
    const width = destination.offsetWidth;
    const height = destination.offsetHeight;
    const focusScale = Math.max(0.1, Math.min(2.15, (pool.width - 28) / width, (pool.height - 88) / height));
    const focusX = pool.left + (pool.width - width * focusScale) / 2;
    const focusY = pool.top + 62;
    const transform = (x: number, y: number, sx: number, sy = sx) =>
      `translate3d(${x}px, ${y}px, 0) scale(${sx}, ${sy})`;
    const focusTransform = transform(focusX, focusY, focusScale);
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.opacity = '1';

    const animate = async (keyframes: Keyframe[], duration: number, easing = 'cubic-bezier(0.22, 0.75, 0.25, 1)') => {
      const animation = overlay.animate(keyframes, {
        duration,
        easing,
        fill: 'forwards',
      });
      animations.push(animation);
      await animation.finished;
    };

    const run = async () => {
      await animate([
        { transform: transform(from.left, from.top, from.width / width, from.height / height) },
        { transform: focusTransform },
      ], 680);
      if (cancelled) return;
      onPhaseChange('commentary');
      // Dialogue is already typing: hold the enlarged NEXT cover long enough to read it.
      await new Promise<void>(resolve => {
        waitTimer = setTimeout(resolve, 1050);
      });
      if (cancelled) return;
      onPhaseChange('flying');
      // Measure after the tier camera has finished scrolling.
      const to = destination.getBoundingClientRect();
      // One continuous trip ends exactly at the emphasized card. There is no
      // second easing curve that would stop, hover, then shrink again.
      const flightDuration = 720;
      landingTimer = setTimeout(() => { if (!cancelled) onPhaseChange('landing'); }, flightDuration - 130);
      if (titleRef.current) animations.push(titleRef.current.animate([
        { opacity: 1, offset: 0 }, { opacity: 1, offset: 0.7 }, { opacity: 0, offset: 1 },
      ], { duration: flightDuration, fill: 'forwards' }));
      await animate([
        { transform: focusTransform },
        { transform: transform(to.left, to.top, to.width / width, to.height / height) },
      ], flightDuration, 'cubic-bezier(0.35, 0, 0.2, 1)');
      if (!cancelled) onPhaseChange('settled');
    };
    void run().catch(() => { if (!cancelled) onPhaseChange('settled'); });

    const settleOnResize = () => {
      cancelled = true;
      clearTimeout(waitTimer);
      clearTimeout(landingTimer);
      animations.forEach(animation => animation.cancel());
      onPhaseChange('settled');
    };
    window.addEventListener('resize', settleOnResize);
    return () => {
      cancelled = true;
      clearTimeout(waitTimer);
      clearTimeout(landingTimer);
      animations.forEach(animation => animation.cancel());
      window.removeEventListener('resize', settleOnResize);
    };
  }, [anime.id, poolPosters, tierPoster, onPhaseChange]);

  return createPortal(
    <div
      ref={posterRef}
      data-testid="studio-entrance-poster"
      aria-hidden="true"
      className="fixed top-0 left-0 z-[100] pointer-events-none rounded-[16px] overflow-hidden bg-zinc-900"
      style={{ opacity: 0, transformOrigin: '0 0', willChange: 'transform', boxShadow: '0 12px 28px rgba(0,0,0,0.4)' }}
    >
      <img src={anime.cover} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      <div ref={titleRef} data-testid="studio-entrance-title" className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 via-black/50 to-transparent px-2.5 pt-3 pb-7">
        <p className="text-[11px] leading-snug font-semibold text-white text-center line-clamp-3 [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">{anime.title}</p>
      </div>
    </div>,
    document.body,
  );
};
