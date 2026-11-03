export type ReportRenderBlock =
  | { type: 'html-viz'; htmlContent: string; summary?: string }
  | { type: 'html-viz-loading' }
  | { type: 'narrative'; markdown: string };

/** Keep existing reports and edited prompts usable after the wrapper rename. */
export function normalizeReportMarkup(text: string): string {
  return text.replace(/\bhtm1fenge\b/gi, 'anitier-view');
}

export function parseReportIntoRichBlocks(text: string): ReportRenderBlock[] {
  const rawText = normalizeReportMarkup(text);
  if (!rawText.trim()) return [];
  const blocks: ReportRenderBlock[] = [];
  const htmlBlockRegex =
    /<anitier-view>([\s\S]*?)<\/anitier-view>(?:\s*<!--\s*FRONTEND_SUMMARY:\s*([\s\S]*?)\s*-->)?/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pushMarkdownSegment = (segment: string) => {
    const cleaned = segment.replace(/<!--\s*FRONTEND_SUMMARY:[\s\S]*?-->/gi, '').trim();
    if (cleaned) blocks.push({ type: 'narrative', markdown: cleaned });
  };
  while ((match = htmlBlockRegex.exec(rawText)) !== null) {
    pushMarkdownSegment(rawText.slice(lastIndex, match.index));
    blocks.push({ type: 'html-viz', htmlContent: match[1] || '', summary: match[2]?.trim() });
    lastIndex = match.index + match[0].length;
  }
  const remaining = rawText.slice(lastIndex);
  const unclosedIdx = remaining.search(/<anitier-view>/i);
  if (unclosedIdx !== -1) {
    pushMarkdownSegment(remaining.slice(0, unclosedIdx));
    blocks.push({ type: 'html-viz-loading' });
  } else {
    pushMarkdownSegment(remaining);
  }
  return blocks;
}
