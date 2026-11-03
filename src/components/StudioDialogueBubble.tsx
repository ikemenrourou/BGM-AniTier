import React, { useLayoutEffect, useRef, useState } from 'react';

// Draw in screen pixels so a growing bubble never flattens or stretches its tail.
function bubbleOutline(width: number, height: number): string {
  const bottom = height - 10;
  const angle = 20 * Math.PI / 180;
  const rotateTailPoint = (x: number, y: number) => {
    const dx = x - 57;
    const dy = y - bottom;
    return `${(57 + dx * Math.cos(angle) - dy * Math.sin(angle)).toFixed(2)} ${(bottom + dx * Math.sin(angle) + dy * Math.cos(angle)).toFixed(2)}`;
  };
  return `M 25 8 C 53 5, ${width - 48} 6, ${width - 22} 9
    Q ${width - 7} 10, ${width - 8} 25 L ${width - 9} ${bottom - 13}
    Q ${width - 9} ${bottom + 1}, ${width - 24} ${bottom + 1}
    C ${width - 66} ${bottom + 3}, 98 ${bottom + 2}, ${rotateTailPoint(73, bottom)}
    L ${rotateTailPoint(48, bottom + 30)} L ${rotateTailPoint(43, bottom)}
    C 27 ${bottom + 1}, 9 ${bottom + 2}, 9 ${bottom - 13}
    L 9 26 Q 9 9, 25 8 Z`;
}

export const StudioDialogueBubble = React.memo(function StudioDialogueBubble({
  text,
  isSpeakingNow,
  isTypingComplete,
  testId,
  fontSize = 13.5,
}: {
  text: string;
  isSpeakingNow: boolean;
  isTypingComplete: boolean;
  testId?: string;
  fontSize?: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLParagraphElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [frame, setFrame] = useState({ width: 160, height: 78 });
  const [availableWidth, setAvailableWidth] = useState(160);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const container = body.parentElement?.parentElement;
    const updateSize = () => {
      const width = body.offsetWidth;
      const height = body.offsetHeight;
      setFrame(previous => previous.width === width && previous.height === height ? previous : { width, height });
      if (container) setAvailableWidth(container.clientWidth);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(body);
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    setTextWidth(measureRef.current?.offsetWidth || 0);
    if (isSpeakingNow && copyRef.current) copyRef.current.scrollTop = copyRef.current.scrollHeight;
  }, [text, fontSize, isSpeakingNow]);

  // Clamp before animating so each new character cannot restart a full-width transition.
  // Keep the current text inside the border even when several characters arrive together.
  const minimumWidth = Math.min(availableWidth, Math.max(160, textWidth + 56));
  const targetWidth = Math.min(availableWidth, Math.max(160, textWidth + 56 + fontSize * 1.5));
  const outline = bubbleOutline(frame.width, frame.height);
  return (
    <div
      data-testid={testId ? `${testId}-frame` : undefined}
      className={`studio-dialogue-bubble relative isolate hand-drawn-bubble-enter ${isSpeakingNow ? 'opacity-100' : 'opacity-90'}`}
      style={{ width: targetWidth, minWidth: minimumWidth, fontSize }}
    >
      <span ref={measureRef} aria-hidden="true" className="studio-bubble-measure font-bold tracking-wide">{text}</span>
      <div ref={bodyRef} className="studio-bubble-body relative">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${frame.width} ${frame.height + 28}`}
          preserveAspectRatio="none"
          className="studio-bubble-outline absolute left-0 top-0 w-full pointer-events-none overflow-visible"
          style={{ height: 'calc(100% + 28px)', filter: 'url(#hand-drawn-boil)' }}
        >
          <path d={outline} fill="#FAF8F5" stroke="#FFFFFF" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
          <path d={outline} fill="#FAF8F5" stroke="#141417" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="relative z-10 min-h-[78px] px-7 py-4 flex items-center" style={{ width: availableWidth }}>
          <p ref={copyRef} data-testid={testId} className="studio-bubble-copy w-full text-zinc-900 font-bold leading-[1.58] tracking-wide whitespace-pre-wrap">
            {text}
            {isSpeakingNow && !isTypingComplete && <span aria-hidden="true" className="studio-typing-caret" />}
          </p>
        </div>
      </div>
    </div>
  );
});
