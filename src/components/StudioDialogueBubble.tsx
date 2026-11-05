import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

export type BubbleInlineEffectType = 'none' | 'big' | 'shake' | 'mask' | 'whisper';

export interface BubbleInlineSegment {
  text: string;
  effect: BubbleInlineEffectType;
}

const EFFECT_KEYWORD_PATTERN =
  'big|large|shake|mask|spoiler|del|strike|whisper|weak|大|放大|抖|颤抖|码|打码|划|划掉|删除|删除线|横杠|虚|心虚|小声';

const BUBBLE_MALFORMED_DOUBLE_BRACKET_RE = new RegExp(
  `<\\s*(${EFFECT_KEYWORD_PATTERN})\\s*\\]([^\\]\\n<>]{1,40})\\](?!\\s*(?:<|\\[)\\s*\\/)`,
  'gi',
);
const BUBBLE_CURLY_COLON_EFFECT_RE = new RegExp(
  `\\{\\s*(${EFFECT_KEYWORD_PATTERN})\\s*[:：]([^}]*)(?:\\}|$)`,
  'gi',
);
const BUBBLE_ANGLE_OR_SQUARE_COLON_EFFECT_RE = new RegExp(
  `(?:<|\\[)\\s*(${EFFECT_KEYWORD_PATTERN})\\s*[:：]([^>\\]\\n]*)(?:>|\\]|$)`,
  'gi',
);
const BUBBLE_CLOSING_EFFECT_TAG_RE = new RegExp(
  `(?:<|\\[)\\s*\\/\\s*(${EFFECT_KEYWORD_PATTERN})\\s*(?:>|\\])`,
  'gi',
);
const BUBBLE_ANGLE_OPENING_EFFECT_TAG_RE = new RegExp(
  `<\\s*(${EFFECT_KEYWORD_PATTERN})\\s*(?:>|\\])`,
  'gi',
);
const BUBBLE_SQUARE_OPENING_EFFECT_TAG_RE = new RegExp(
  `\\[\\s*(${EFFECT_KEYWORD_PATTERN})\\s*(?:>|\\])`,
  'gi',
);
const BUBBLE_STRAY_EFFECT_TAG_RE = new RegExp(
  `(?:<|\\[)\\s*\\/?\\s*(?:${EFFECT_KEYWORD_PATTERN})\\s*(?:>|\\])`,
  'gi',
);

function normalizeEffectName(rawTag: string): BubbleInlineEffectType {
  const lower = rawTag.trim().toLowerCase();
  if (lower === 'big' || lower === '大' || lower === '放大' || lower === 'large') return 'big';
  if (lower === 'shake' || lower === '抖' || lower === '颤抖') return 'shake';
  if (
    lower === 'mask' ||
    lower === 'spoiler' ||
    lower === 'del' ||
    lower === 'strike' ||
    lower === '码' ||
    lower === '打码' ||
    lower === '划' ||
    lower === '划掉' ||
    lower === '删除' ||
    lower === '删除线' ||
    lower === '横杠'
  ) {
    return 'mask';
  }
  if (lower === 'whisper' || lower === 'weak' || lower === '虚' || lower === '心虚' || lower === '小声') {
    return 'whisper';
  }
  return 'none';
}

/**
 * Repairs common LLM bracket mix-ups on inline effect tags (e.g. `<mask]文字</mask>`,
 * `<mask]文字]`, `[mask]文字[/mask]`, `<del>文字</del>`, `{划:文字}`) into canonical
 * `<big>...</big>`, `<shake>...</shake>`, `<mask>...</mask>`, `<whisper>...</whisper>`.
 */
export function normalizeInlineEffectMarkup(rawText: string): string {
  if (!rawText) return '';

  // 1. `<mask]文字]` where `<` opened and `]` closed both the tag name and the span (without a following `</...>`)
  let text = rawText.replace(
    BUBBLE_MALFORMED_DOUBLE_BRACKET_RE,
    (_m, tag, inner) => {
      const canon = normalizeEffectName(tag);
      return canon !== 'none' ? `<${canon}>${inner}</${canon}>` : inner;
    },
  );

  // 2. Colon-style `{大:文字}`, `{划:文字}`, `{码:文字}`, `<mask:文字>`, `[mask:文字]`
  text = text.replace(
    BUBBLE_CURLY_COLON_EFFECT_RE,
    (_m, tag, inner) => {
      const canon = normalizeEffectName(tag);
      return canon !== 'none' ? `<${canon}>${inner}</${canon}>` : inner;
    },
  );
  text = text.replace(
    BUBBLE_ANGLE_OR_SQUARE_COLON_EFFECT_RE,
    (_m, tag, inner) => {
      const canon = normalizeEffectName(tag);
      return canon !== 'none' ? `<${canon}>${inner}</${canon}>` : inner;
    },
  );

  // 3. Closing tags with any mix of `<`/`[` and `>`/`]`: `</mask>`, `[/mask]`, `</mask]`, `[/mask>`
  text = text.replace(
    BUBBLE_CLOSING_EFFECT_TAG_RE,
    (_m, tag) => {
      const canon = normalizeEffectName(tag);
      return canon !== 'none' ? `</${canon}>` : '';
    },
  );

  // 4. Opening tags with `<` and `>` or `]` (e.g. `<mask>`, `<mask]`, `<del>`, `<big]`):
  text = text.replace(
    BUBBLE_ANGLE_OPENING_EFFECT_TAG_RE,
    (_m, tag) => {
      const canon = normalizeEffectName(tag);
      return canon !== 'none' ? `<${canon}>` : '';
    },
  );

  // 5. Bracketed opening tags `[mask]`, `[big]`, `[shake]`, `[whisper]`, `[del]`
  text = text.replace(
    BUBBLE_SQUARE_OPENING_EFFECT_TAG_RE,
    (_m, tag) => {
      const canon = normalizeEffectName(tag);
      return canon !== 'none' ? `<${canon}>` : '';
    },
  );

  // 6. Markdown strikethrough `~~文字~~`
  text = text.replace(/~~([^~\n]+)(?:~~|$)/g, '<mask>$1</mask>');

  // 7. Duplicate opening tag used as closer: `<mask>文字<mask>` -> `<mask>文字</mask>`
  text = text.replace(/<(big|shake|mask|whisper)>([^<>]+)<\1>/gi, '<$1>$2</$1>');

  return text;
}

/**
 * Auto-closes any unclosed `<big>`, `<shake>`, `<mask>`, `<whisper>` tag in a completed dialogue line
 * at the next clause punctuation (`，。！？；,!?;`) so a missing closing tag never swallows the whole paragraph.
 */
export function closeUnclosedInlineEffectTags(rawText: string): string {
  const normalized = normalizeInlineEffectMarkup(rawText);
  return normalized.replace(
    /<(big|shake|mask|whisper)>(?![\s\S]*?<\/\1>)([^，。！？；,!?;]*)/gi,
    '<$1>$2</$1>',
  );
}

/**
 * Parses inline effect markup (`<big>...</big>`, `<shake>...</shake>`, `<mask>...</mask>`, `<whisper>...</whisper>`,
 * `{大:...}`, `{抖:...}`, `{码:...}`, `{划:...}`, `{虚:...}`, `~~...~~`, and malformed `<mask]...`) from full or partially-typed bubble text.
 * Gracefully handles unclosed tags at the end of a typing slice so effects apply immediately while typing.
 */
export function parseBubbleInlineEffects(rawText: string): {
  plainText: string;
  segments: BubbleInlineSegment[];
} {
  if (!rawText) {
    return { plainText: '', segments: [] };
  }

  // Strip any trailing half-typed tag opener/closer like `<bi`, `</sh`, `<mask`, `{划` at the very end of the slice
  const withoutTrailingPartialTag = rawText
    .replace(/(?:<|\[)\/?(?:[a-zA-Z]{0,10}|[大放大抖颤码打划删虚心小]{0,4})$/, '')
    .replace(/\{[a-zA-Z大放大抖颤码打划删虚心小]{0,4}$/, '');

  const normalized = normalizeInlineEffectMarkup(withoutTrailingPartialTag);

  const tokenRegex = /<(big|shake|mask|whisper)>([\s\S]*?)(?:<\/\1>|$)/gi;

  const segments: BubbleInlineSegment[] = [];
  let plainText = '';
  let lastIdx = 0;

  const stripStrayTags = (s: string) => s.replace(BUBBLE_STRAY_EFFECT_TAG_RE, '');

  for (const match of normalized.matchAll(tokenRegex)) {
    const start = match.index ?? 0;
    if (start > lastIdx) {
      const before = stripStrayTags(normalized.slice(lastIdx, start));
      if (before) {
        segments.push({ text: before, effect: 'none' });
        plainText += before;
      }
    }

    const effect = normalizeEffectName(match[1]);
    const inner = stripStrayTags(match[2] || '');
    if (inner) {
      segments.push({ text: inner, effect });
      plainText += inner;
    }

    lastIdx = start + match[0].length;
  }

  if (lastIdx < normalized.length) {
    const tail = stripStrayTags(normalized.slice(lastIdx));
    if (tail) {
      segments.push({ text: tail, effect: 'none' });
      plainText += tail;
    }
  }

  return { plainText, segments };
}

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
  fontSize = 17,
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

  const parsed = useMemo(() => parseBubbleInlineEffects(text), [text]);

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
  }, [parsed.plainText, fontSize, isSpeakingNow]);

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
      <span ref={measureRef} aria-hidden="true" className="studio-bubble-measure font-bold tracking-wide">
        {parsed.plainText}
      </span>
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
            {parsed.segments.map((seg, idx) => {
              if (seg.effect === 'big') {
                return (
                  <span key={idx} data-fx="big" className="studio-fx-big">
                    {seg.text}
                  </span>
                );
              }
              if (seg.effect === 'shake') {
                return (
                  <span key={idx} data-fx="shake" className="studio-fx-shake">
                    {seg.text}
                  </span>
                );
              }
              if (seg.effect === 'mask') {
                return (
                  <span key={idx} data-fx="mask" className="studio-fx-mask">
                    {seg.text}
                  </span>
                );
              }
              if (seg.effect === 'whisper') {
                return (
                  <span key={idx} data-fx="whisper" className="studio-fx-whisper">
                    {seg.text}
                  </span>
                );
              }
              return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
            })}
            {isSpeakingNow && !isTypingComplete && <span aria-hidden="true" className="studio-typing-caret" />}
          </p>
        </div>
      </div>
    </div>
  );
});
