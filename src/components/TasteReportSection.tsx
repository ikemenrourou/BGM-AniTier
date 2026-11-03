import { fetchAppApi } from '../lib/runtime';
import DOMPurify from 'dompurify';
import { SafeReportFrame } from './SafeReportFrame';
import { PromptPlacementControls } from './PromptPlacementControls';
import { appliesToWorldBookScope, DEFAULT_PROMPT_PLACEMENT, describePromptPlacement, sortPromptEntries, WORLD_BOOK_SCOPE_LABELS } from '../lib/promptOrder';
import { appStorage } from '../lib/appStorage';
import { STORAGE_KEYS } from '../lib/persistenceSchema';
import { FEIYU_AVATAR_URL, upgradeFeiyuPrompt } from '../lib/feiyuPersona';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  RotateCcw,
  KeyRound,
  Globe,
  Cpu,
  BookOpen,
  Plus,
  UserPlus,
  Trash2,
  Edit3,
  Eye,
  MessageSquarePlus,
  Database,
  Send,
  Flame,
  Award,
  Zap,
  Tv,
  Gamepad2,
  Quote,
  MessageSquareWarning,
} from 'lucide-react';
import { marked } from 'marked';
import type {
  AIConfig,
  AIRoleConfig,
  AIRoleId,
  AnimeItem,
  CommentItem,
  TierGradingSystem,
  TierMap,
  WorldBookEntry,
} from '../types';
import {
  AI_ROLES,
  ALL_TIER_SCORES,
  DEFAULT_PERSONAS,
  DEFAULT_WORLD_BOOK_ENTRIES,
  buildTasteReportPrompt,
  formatTierLabel,
  normalizeWorldBookEntries,
  normalizeWorldBookConfig,
} from '../lib/tierLogic';
import {
  enrichTierMapWithDeepBangumiData,
} from '../lib/bangumiApi';
import { summarizeDiscussionData } from '../lib/studioContext';
import { normalizeReportMarkup, parseReportIntoRichBlocks } from '../lib/reportMarkup';

interface TasteReportSectionProps {
  tiers: TierMap;
  comments: CommentItem[];
  gradingSystem?: TierGradingSystem;
  savedReport: string;
  onSaveReport: (report: string) => void;
  externalAiConfig?: AIConfig;
  onAiConfigChange?: (config: AIConfig) => void;
  autoEnrichStatus?: { active: boolean; done: number; total: number };
  onUpdateTiers?: (nextTiers: TierMap) => void;
  onAdoptComment?: (anime: AnimeItem, score: number, text: string) => void;
}

export const AI_CONFIG_STORAGE_KEY = 'anime-tier-list-ai-config-v10';

const API_PRESETS = [
  {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
  },
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
  },
  {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.5-flash',
  },
];

const STICKERS_BY_ROLE: Record<string, string[]> = {
  feiyu: [FEIYU_AVATAR_URL],
  mesugaki: [
    'https://files.catbox.moe/wmnaa7.png',
    'https://files.catbox.moe/1bidx0.png',
    'https://files.catbox.moe/ntsuih.png',
    'https://files.catbox.moe/dduita.png',
  ],
  cat_girl: ['https://files.catbox.moe/4j3i9t.png'],
  atri: ['https://files.catbox.moe/bjawgi.jpg'],
  patrick_star: ['https://files.catbox.moe/e1cxho.png'],
};

function normalizePersonasList(
  savedPersonas?: unknown[] | null,
  fromLegacyStorage = false,
): AIRoleConfig[] {
  if (!Array.isArray(savedPersonas) || savedPersonas.length === 0) {
    return DEFAULT_PERSONAS.map(p => ({ ...p }));
  }
  const map = new Map<string, AIRoleConfig>();
  for (const def of DEFAULT_PERSONAS) {
    map.set(def.id, { ...def });
  }
  for (const raw of savedPersonas) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;

    let cleanName = typeof item.displayName === 'string' ? item.displayName : '自定义人设';
    if (id === 'mesugaki' && (cleanName.includes('雌小鬼') || cleanName.includes('Mesugaki'))) {
      cleanName = '婆罗门zako';
    } else if (id === 'cat_girl' && cleanName.includes('(Neko)')) {
      cleanName = '元气猫娘';
    } else if (id === 'atri' && cleanName.includes('(ATRI)')) {
      cleanName = '亚托莉';
    } else if (id === 'patrick_star' && cleanName.includes('(Patrick)')) {
      cleanName = '派大星';
    }

    const fallbackDef = (AI_ROLES as Record<string, AIRoleConfig>)[id];
    const isBuiltIn = Boolean(fallbackDef) && !item.isCustom;

    // If migrating from older storage keys (v5-v7), upgrade built-in personas to the authentic prompts from my-tier-list.js
    const rawPrompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
    const isOldGeneratedPrompt =
      fromLegacyStorage ||
      (isBuiltIn &&
        rawPrompt.length < 400 &&
        !rawPrompt.includes('<RoleDefinition>'));

    const prompt = isBuiltIn && id === 'feiyu'
      ? upgradeFeiyuPrompt(rawPrompt)
      : isOldGeneratedPrompt && fallbackDef ? fallbackDef.prompt : rawPrompt || fallbackDef?.prompt || '';

    map.set(id, {
      id,
      displayName: cleanName,
      avatarUrl:
        typeof item.avatarUrl === 'string' && item.avatarUrl.trim()
          ? item.avatarUrl
          : fallbackDef?.avatarUrl || 'https://files.catbox.moe/48ttww.png',
      prompt: normalizeReportMarkup(prompt),
      isCustom: Boolean(item.isCustom),
    });
  }
  return Array.from(map.values());
}

export function loadSavedAiConfig(): AIConfig {
  try {
    const v10 = appStorage.getItem(AI_CONFIG_STORAGE_KEY);
    const legacy =
      appStorage.getItem('anime-tier-list-ai-config-v9') ||
      appStorage.getItem('anime-tier-list-ai-config-v8') ||
      appStorage.getItem('anime-tier-list-ai-config-v7') ||
      appStorage.getItem('anime-tier-list-ai-config-v6') ||
      appStorage.getItem('anime-tier-list-ai-config-v5');
    const saved = v10 || legacy;
    const fromLegacy = !v10 && Boolean(legacy);

    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        baseUrl:
          parsed.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: parsed.apiKey || '',
        model: parsed.model || 'gemini-2.5-flash',
        availableModels: Array.isArray(parsed.availableModels) ? parsed.availableModels : [],
        selectedPersonaId: parsed.selectedPersonaId || 'mesugaki',
        personas: normalizePersonasList(parsed.personas, fromLegacy),
        ...normalizeWorldBookConfig({ worldBookEntries: parsed.worldBookEntries, d0Prompt: typeof parsed.d0Prompt === 'string' ? parsed.d0Prompt : '' }),
      };
    }
  } catch {
    // ignore
  }
  return {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    model: 'gemini-2.5-flash',
    availableModels: [],
    selectedPersonaId: 'mesugaki',
    personas: normalizePersonasList(DEFAULT_PERSONAS),
    worldBookEntries: normalizeWorldBookEntries(DEFAULT_WORLD_BOOK_ENTRIES),
    d0Prompt: '',
  };
}

const HtmlSandboxRenderer: React.FC<{
  rawHtml: string;
  summary?: string;
  animeByTitle: Map<string, AnimeItem>;
  characterByName: Map<string, { name: string; avatar: string; cv?: string }>;
  persona: AIRoleConfig;
}> = ({ rawHtml, animeByTitle, characterByName, persona }) => {


  const processedHtml = useMemo(() => {
    let content = rawHtml.trim();
    // Strip markdown ```html ... ``` fences if present
    content = content
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Extract inner body if <body>...</body> wrapper exists
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = bodyMatch[1].trim();
    }

    // Macro 1: {{cover:作品名}} -> matched anime cover URL
    content = content.replace(/\{\{\s*cover\s*:\s*([^}]+?)\s*\}\}/gi, (_match, rawName) => {
      const cleanName = String(rawName).trim().replace(/^《|》$/g, '');
      const exact = animeByTitle.get(cleanName);
      if (exact?.cover) return exact.cover;
      for (const [k, v] of animeByTitle.entries()) {
        if (k.includes(cleanName) || cleanName.includes(k)) {
          return v.cover;
        }
      }
      return persona.avatarUrl;
    });

    // Macro 2: {{char:角色名}} -> matched character avatar URL
    content = content.replace(/\{\{\s*char\s*:\s*([^}]+?)\s*\}\}/gi, (_match, rawName) => {
      const cleanName = String(rawName).trim().replace(/^【|】$/g, '');
      const exact = characterByName.get(cleanName);
      if (exact?.avatar) return exact.avatar;
      for (const [k, v] of characterByName.entries()) {
        if (k.includes(cleanName) || cleanName.includes(k)) {
          return v.avatar;
        }
      }
      return persona.avatarUrl;
    });

    // Macro 3: {{avatar}} -> active persona avatar URL
    content = content.replace(/\{\{\s*avatar\s*\}\}/gi, persona.avatarUrl);

    // Macro 4: {{persona_name}} -> active persona displayName
    content = content.replace(/\{\{\s*persona_name\s*\}\}/gi, persona.displayName);

    return content;
  }, [rawHtml, animeByTitle, characterByName, persona]);

  return <SafeReportFrame html={processedHtml} />;
};

export const TasteReportSection: React.FC<TasteReportSectionProps> = ({
  tiers,
  comments,
  gradingSystem = 'numeric',
  savedReport,
  onSaveReport,
  autoEnrichStatus,
  onUpdateTiers,
  onAdoptComment,
  externalAiConfig,
  onAiConfigChange,
}) => {
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => externalAiConfig || loadSavedAiConfig());
  const aiConfigRef = useRef(aiConfig);
  aiConfigRef.current = aiConfig;
  const [streamingText, setStreamingText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [showStudioPanel, setShowStudioPanel] = useState<boolean>(false);
  const [studioTab, setStudioTab] = useState<'worldbook' | 'personas' | 'api' | 'preview'>(
    'worldbook',
  );

  // World Book Left-List + Right-Editor State
  const [selectedEntryId, setSelectedEntryId] = useState<string>('wb-d0-default');
  const [showNewEntryForm, setShowNewEntryForm] = useState<boolean>(false);
  const [newEntryTitle, setNewEntryTitle] = useState<string>('');
  const [newEntryShortDesc, setNewEntryShortDesc] = useState<string>('');
  const [newEntryContent, setNewEntryContent] = useState<string>('');
  const [newEntryPlacement, setNewEntryPlacement] = useState({ ...DEFAULT_PROMPT_PLACEMENT, scope: 'all' as const } as Pick<WorldBookEntry, 'position' | 'priority' | 'scope'>);

  // Persona Editing State
  const [editingPersonaId, setEditingPersonaId] = useState<string>('mesugaki');
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  // Deep Bangumi Data Enrichment State
  const [isEnrichingBgm, setIsEnrichingBgm] = useState<boolean>(false);
  const [enrichProgressText, setEnrichProgressText] = useState<string | null>(null);
  const [promptRefreshStatus, setPromptRefreshStatus] = useState<string | null>(null);
  const promptRefreshRef = useRef(false);

  // Model Fetching State
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchModelsMsg, setFetchModelsMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Multi-turn Reply / Follow-up Conversation State
  const [replyMessages, setReplyMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >(() => {
    try {
      const saved = JSON.parse(appStorage.getItem(STORAGE_KEYS.REPORT_CHAT) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string') : [];
    } catch { return []; }
  });
  useEffect(() => { appStorage.setItem(STORAGE_KEYS.REPORT_CHAT, JSON.stringify(replyMessages)); }, [replyMessages]);
  const [replyInput, setReplyInput] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);

  useEffect(() => {
    if (externalAiConfig) {
      setAiConfig(prev => ({
        ...prev,
        ...externalAiConfig,
        availableModels: Array.isArray(externalAiConfig.availableModels)
          ? externalAiConfig.availableModels
          : prev.availableModels || [],
        personas: normalizePersonasList(externalAiConfig.personas || prev.personas),
        ...normalizeWorldBookConfig({ worldBookEntries: externalAiConfig.worldBookEntries || prev.worldBookEntries, d0Prompt: externalAiConfig.d0Prompt ?? prev.d0Prompt }),
      }));
    }
  }, [externalAiConfig]);

  const updateAiConfig = (updater: (prev: AIConfig) => AIConfig) => {
    const next = updater(aiConfigRef.current);
    const normalized: AIConfig = {
      ...next,
      availableModels: Array.isArray(next.availableModels) ? next.availableModels : [],
      personas: normalizePersonasList(next.personas),
      ...normalizeWorldBookConfig(next),
    };
    aiConfigRef.current = normalized;
    setAiConfig(normalized);
    // Save and notify from the event, never from a React state updater/render.
    appStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    onAiConfigChange?.(normalized);
  };

  const personas = useMemo(
    () => normalizePersonasList(aiConfig.personas),
    [aiConfig.personas],
  );

  const worldBookEntries = useMemo(
    () => normalizeWorldBookEntries(aiConfig.worldBookEntries),
    [aiConfig.worldBookEntries],
  );

  const selectedPersonaId = aiConfig.selectedPersonaId || 'mesugaki';
  const selectedPersona = useMemo(
    () => personas.find(p => p.id === selectedPersonaId) || personas[0] || AI_ROLES.mesugaki,
    [personas, selectedPersonaId],
  );

  const editingPersona = useMemo(
    () => personas.find(p => p.id === editingPersonaId) || selectedPersona,
    [personas, editingPersonaId, selectedPersona],
  );

  const selectedWorldBookEntry = useMemo(
    () =>
      worldBookEntries.find(e => e.id === selectedEntryId) ||
      worldBookEntries[0],
    [worldBookEntries, selectedEntryId],
  );

  const enabledWorldBookCount = useMemo(
    () => worldBookEntries.filter(e => e.enabled && appliesToWorldBookScope(e, 'report')).length,
    [worldBookEntries],
  );

  const assembledPrompt = useMemo(
    () =>
      buildTasteReportPrompt(tiers, comments, selectedPersona.id, {
        persona: selectedPersona,
        worldBookEntries,
        d0Prompt: aiConfig.d0Prompt || '',
        gradingSystem,
      }),
    [tiers, comments, selectedPersona, worldBookEntries, aiConfig.d0Prompt, gradingSystem],
  );

  const animeWithUserScoreByTitle = useMemo(() => {
    const map = new Map<string, { anime: AnimeItem; userScore: number }>();
    for (const score of ALL_TIER_SCORES) {
      for (const item of tiers[String(score)] || []) {
        map.set(item.title, { anime: item, userScore: score });
      }
    }
    return map;
  }, [tiers]);

  const animeByTitle = useMemo(() => {
    const map = new Map<string, AnimeItem>();
    for (const [title, entry] of animeWithUserScoreByTitle.entries()) {
      map.set(title, entry.anime);
    }
    return map;
  }, [animeWithUserScoreByTitle]);

  const characterByName = useMemo(() => {
    const LEGACY_WRONG_CHAR_IDS = new Set([
      87470, 87471, 87472, 87473, 86293, 86294, 86295, 86296, 129147, 129148, 129150, 109611,
      109612, 104215, 104216,
    ]);
    const map = new Map<string, { name: string; avatar: string; cv?: string }>();
    const registerAnimeChars = (anime: AnimeItem, skipLegacyIds = false) => {
      if (!Array.isArray(anime.characters)) return;
      for (const ch of anime.characters) {
        if (!ch) continue;
        if (skipLegacyIds && LEGACY_WRONG_CHAR_IDS.has(ch.id)) continue;
        const avatar =
          ch.avatar ||
          (ch.id > 0 ? `https://api.bgm.tv/v0/characters/${ch.id}/image?type=medium` : '');
        if (!avatar) continue;
        const display = ch.nameCn || ch.name;
        const info = { name: display, avatar, cv: ch.cv };
        if (ch.nameCn) map.set(ch.nameCn.trim(), info);
        if (ch.name) map.set(ch.name.trim(), info);
      }
    };
    for (const score of ALL_TIER_SCORES) {
      for (const item of tiers[String(score)] || []) {
        registerAnimeChars(item, true);
      }
    }
    return map;
  }, [tiers]);

  const activeReportText = normalizeReportMarkup(streamingText || savedReport || '');

  const formatMarkdownSegmentToHtml = (markdownSegment: string): string => {
    if (!markdownSegment) return '';
    try {
      const stickers = STICKERS_BY_ROLE[selectedPersona.id] || [selectedPersona.avatarUrl];
      // Prevent standalone sticker lines from creating their own paragraph / line break!
      const mergedStickerLines = markdownSegment
        .replace(/(?<!~)~(?!~)/g, '～')
        .replace(
          /\n+\s*((?:<img\s+[^>]*src=["']https:\/\/files\.catbox\.moe\/[^"']+["'][^>]*>|\s*\[STICKER_\d+\]\s*)+)/gi,
          ' $1',
        );

      let rawHtml = marked.parse(mergedStickerLines, { async: false }) as string;

      stickers.forEach((url, idx) => {
        const token = new RegExp(`\\[STICKER_${idx}\\]`, 'g');
        rawHtml = rawHtml.replace(
          token,
          `<img src="${url}" alt="sticker" class="report-sticker" />`,
        );
      });

      // Style inline <img src="https://files.catbox.moe/..."> stickers so they sit snugly inline with text
      rawHtml = rawHtml.replace(
        /<img\s+[^>]*src=["'](https:\/\/files\.catbox\.moe\/[^"']+)["'][^>]*>/gi,
        `<img src="$1" alt="sticker" class="report-sticker" />`,
      );

      // Style parenthetical score comparisons inside <h3> headings cleanly before badge injection
      rawHtml = rawHtml.replace(
        /(<h3[^>]*>[\s\S]*?)([（(][^）)\n]*评分[^）)\n]*[）)])(\s*<\/h3>)/gi,
        `$1<span class="report-score">$2</span>$3`,
      );

      // 1. Render 《作品名》: standalone poster on the left + dark glass tag ONLY wrapping the title text on the right.
      // Also match HTML-escaped titles (e.g. It's MyGO -> It&#39;s MyGO) produced by marked.parse().
      animeByTitle.forEach((anime, title) => {
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const htmlEscapedTitle = title
          .replace(/&/g, '&amp;')
          .replace(/'/g, '&#39;')
          .replace(/"/g, '&quot;');
        const pattern =
          htmlEscapedTitle !== title
            ? `(?:${escapeRegex(title)}|${escapeRegex(htmlEscapedTitle)})`
            : escapeRegex(title);
        const regex = new RegExp(`《(${pattern})》`, 'g');
        rawHtml = rawHtml.replace(
          regex,
          `<span data-testid="inline-work-badge" class="report-badge"><span class="report-work-cover"><img src="${anime.cover}" alt="${title.replace(/"/g, '&quot;')}" referrerpolicy="no-referrer" class="w-full h-full object-cover" /></span><span class="report-badge-name">《$1》</span></span>`,
        );
      });

      // 2. Render 【角色名】: standalone upper-body/head zoomed portrait on the left + dark glass tag ONLY wrapping the character name on the right.
      // Because Bangumi character portraits are full-body vertical sheets (e.g. 400x1150), setting width: 175% with height: auto anchored at top: -2px frames ONLY the head & upper bust cleanly.
      rawHtml = rawHtml.replace(/【([^】]{1,28})】/g, (fullMatch, innerText) => {
        const cleanInner = String(innerText)
          .replace(/\([^)]*\)|（[^）]*）/g, '')
          .trim();
        let matchedChar = characterByName.get(cleanInner) || characterByName.get(innerText.trim());
        if (!matchedChar) {
          for (const [k, v] of characterByName.entries()) {
            if (cleanInner.length >= 2 && (k.includes(cleanInner) || cleanInner.includes(k))) {
              matchedChar = v;
              break;
            }
          }
        }
        if (matchedChar) {
          const safeAlt = matchedChar.name.replace(/"/g, '&quot;');
          return `<span data-testid="inline-char-badge" class="report-badge"><span class="report-character-cover"><img class="report-character-avatar" src="${matchedChar.avatar}" alt="${safeAlt}" referrerpolicy="no-referrer" /></span><span class="report-badge-name">${matchedChar.name}</span></span>`;
        }
        return fullMatch;
      });

      // 3. Render <code>Staff / Studio</code> as refined dark-glass pills
      rawHtml = rawHtml.replace(
        /<code>([^<]+)<\/code>/g,
        `<span class="report-credit">$1</span>`,
      );

      // 4. Render quoted text (“...” and "..." outside HTML tags) as clean colored text without any background box or border
      rawHtml = rawHtml
        .split(/(<[^>]+>)/g)
        .map(segment => {
          if (segment.startsWith('<')) return segment;
          return segment.replace(
            /(?:“([^”\n]{1,120})”|(?:&quot;|")([^"\n&<>]{2,120})(?:&quot;|"))/g,
            (_m, curlyInner, asciiInner) => {
              const content = curlyInner || asciiInner || '';
              return `<span data-testid="inline-quote-highlight" class="report-quote">“${content}”</span>`;
            },
          );
        })
        .join('');

      rawHtml = rawHtml.replace(
        /❤️/g,
        '<span class="report-heart">❤️</span>',
      );

      return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'], FORBID_ATTR: ['style'] });
    } catch {
      return DOMPurify.sanitize(markdownSegment, { USE_PROFILES: { html: true } });
    }
  };

  const parsedReportBlocks = useMemo(
    () => parseReportIntoRichBlocks(activeReportText),
    [activeReportText],
  );

  // World Book Handlers
  const handleToggleWorldBookEntry = (entryId: string) => {
    updateAiConfig(prev => ({
      ...prev,
      worldBookEntries: normalizeWorldBookEntries(prev.worldBookEntries).map(entry => {
        if (entry.id !== entryId) return entry;
        return { ...entry, enabled: !entry.enabled };
      }),
    }));
  };

  const handleUpdateWorldBookEntry = (
    entryId: string,
    patch: Partial<WorldBookEntry>,
  ) => {
    updateAiConfig(prev => ({
      ...prev,
      worldBookEntries: normalizeWorldBookEntries(prev.worldBookEntries).map(entry =>
        entry.id === entryId ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  const handleAddWorldBookEntry = () => {
    const trimmedTitle = newEntryTitle.trim();
    const trimmedContent = newEntryContent.trim();
    if (!trimmedTitle || !trimmedContent) return;
    const newId = `wb-custom-${Date.now()}`;
    const shortDesc =
      newEntryShortDesc.trim() || trimmedContent.replace(/\s+/g, ' ').slice(0, 48);
    updateAiConfig(prev => ({
      ...prev,
      worldBookEntries: [
        ...normalizeWorldBookEntries(prev.worldBookEntries),
        {
          id: newId,
          title: trimmedTitle,
          shortDesc,
          content: trimmedContent,
          enabled: true,
          ...newEntryPlacement,
        },
      ],
    }));
    setNewEntryTitle('');
    setNewEntryShortDesc('');
    setNewEntryContent('');
    setShowNewEntryForm(false);
    setSelectedEntryId(newId);
  };

  const handleDeleteWorldBookEntry = (entryId: string) => {
    updateAiConfig(prev => ({
      ...prev,
      worldBookEntries: normalizeWorldBookEntries(prev.worldBookEntries).filter(
        e => e.id !== entryId,
      ),
    }));
    if (selectedEntryId === entryId) {
      setSelectedEntryId('wb-d0-default');
    }
  };

  // Persona Handlers
  const handleSelectPersona = (personaId: AIRoleId) => {
    updateAiConfig(prev => ({ ...prev, selectedPersonaId: personaId }));
    setEditingPersonaId(personaId);
  };

  const handleCreateCustomPersona = () => {
    const newId = `custom-persona-${Date.now()}`;
    const newPersona: AIRoleConfig = {
      id: newId,
      displayName: `自定义人设 #${personas.filter(p => p.isCustom).length + 1}`,
      avatarUrl: 'https://files.catbox.moe/48ttww.png',
      prompt:
        '你将扮演一位由用户自定义的动画评论员。你熟悉动画制作公司、监督风格与社区名梗，能够一针见血地剖析用户的看番口味。',
      isCustom: true,
    };
    updateAiConfig(prev => ({
      ...prev,
      selectedPersonaId: newId,
      personas: [...normalizePersonasList(prev.personas), newPersona],
    }));
    setEditingPersonaId(newId);
  };

  const handleUpdatePersona = (personaId: string, patch: Partial<AIRoleConfig>) => {
    updateAiConfig(prev => ({
      ...prev,
      personas: normalizePersonasList(prev.personas).map(p =>
        p.id === personaId ? { ...p, ...patch } : p,
      ),
    }));
  };

  const handleDeleteCustomPersona = (personaId: string) => {
    const target = personas.find(p => p.id === personaId);
    if (!target || !target.isCustom) return;
    updateAiConfig(prev => {
      const remaining = normalizePersonasList(prev.personas).filter(p => p.id !== personaId);
      const nextSelected =
        prev.selectedPersonaId === personaId ? 'mesugaki' : prev.selectedPersonaId;
      return {
        ...prev,
        selectedPersonaId: nextSelected,
        personas: remaining,
      };
    });
    setEditingPersonaId('mesugaki');
  };

  const handleResetBuiltInPersona = (personaId: string) => {
    const def = (AI_ROLES as Record<string, AIRoleConfig>)[personaId];
    if (!def) return;
    handleUpdatePersona(personaId, { ...def });
  };

  // Fetch available models from the user's configured API BaseURL
  const handleFetchModels = async () => {
    const trimmedBase = aiConfig.baseUrl
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/i, '');
    const trimmedKey = aiConfig.apiKey.trim();

    if (!trimmedBase) {
      setFetchModelsMsg({ type: 'err', text: '请先填写 API Base URL' });
      return;
    }

    setIsFetchingModels(true);
    setFetchModelsMsg(null);

    try {
      let modelsList: string[] = [];

      // 1. Try direct browser fetch to ${baseUrl}/models (works directly on Cloudflare Pages & CORS-enabled APIs)
      try {
        const directRes = await fetch(`${trimmedBase}/models`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(trimmedKey ? { Authorization: `Bearer ${trimmedKey}` } : {}),
          },
        });
        if (directRes.ok) {
          const data = await directRes.json();
          const rawArr = Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.models)
            ? data.models
            : [];
          for (const item of rawArr) {
            const rawId =
              typeof item === 'string'
                ? item
                : typeof item?.id === 'string'
                ? item.id
                : typeof item?.name === 'string'
                ? item.name
                : '';
            const cleaned = rawId.replace(/^models\//i, '').trim();
            if (cleaned && !modelsList.includes(cleaned)) {
              modelsList.push(cleaned);
            }
          }
        }
      } catch {
        // Fallback to backend proxy if browser CORS blocks direct /models
      }

      // 2. Fallback to backend /api/ai/models proxy
      if (modelsList.length === 0) {
        const proxyRes = await fetchAppApi('/api/ai/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: trimmedBase,
            apiKey: trimmedKey,
          }),
        });
        const proxyData = await proxyRes.json().catch(() => ({}));
        if (!proxyRes.ok) {
          throw new Error(proxyData?.error || `拉取模型失败 (${proxyRes.status})`);
        }
        if (Array.isArray(proxyData?.models)) {
          modelsList = proxyData.models;
        }
      }

      if (modelsList.length === 0) {
        throw new Error('接口未返回可用模型列表，请检查 Base URL 与 API Key');
      }

      updateAiConfig(prev => {
        const nextModel = modelsList.includes(prev.model) ? prev.model : modelsList[0];
        return {
          ...prev,
          model: nextModel,
          availableModels: modelsList,
        };
      });

      setFetchModelsMsg({
        type: 'ok',
        text: `已成功拉取 ${modelsList.length} 个模型，可在下拉框直接选择`,
      });
    } catch (err) {
      setFetchModelsMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '拉取模型失败，请检查接口地址与 Key',
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleRefreshPrompt = async () => {
    if (promptRefreshRef.current || isGenerating || isEnrichingBgm) return;
    promptRefreshRef.current = true;
    setIsEnrichingBgm(true);
    setPromptRefreshStatus(null);
    try {
      const enriched = await enrichTierMapWithDeepBangumiData(tiers, (done, total) => {
        setEnrichProgressText(`正在刷新作品资料与公开吐槽：${done} / ${total}`);
      }, { force: true });
      onUpdateTiers?.(enriched);
      setPromptRefreshStatus(summarizeDiscussionData(Object.values(enriched).flat()));
    } catch {
      setPromptRefreshStatus('刷新未完成，已保留现有资料，请稍后重试。');
    } finally {
      promptRefreshRef.current = false;
      setIsEnrichingBgm(false);
      setEnrichProgressText(null);
    }
  };

  // Stream from user's configured OpenAI/Gemini-compatible endpoint, or fallback to built-in server Gemini route
  const handleGenerateReport = async () => {
    if (promptRefreshRef.current || isGenerating) return;
    setError(null);
    const trimmedKey = aiConfig.apiKey.trim();
    const trimmedBaseUrl = aiConfig.baseUrl.trim();

    setIsGenerating(true);
    setStreamingText('');

    try {
      // Automatically enrich any remaining un-enriched works before building the prompt;
      // if any network request fails, it gracefully falls back to the work's existing basic metadata.
      let currentTiers = tiers;
      try {
        setIsEnrichingBgm(true);
        const enrichedTiers = await enrichTierMapWithDeepBangumiData(tiers, (done, total) => {
          setEnrichProgressText(
            `正在自动读取 BGM 角色人气与网友吐槽上下文 (${done}/${total})，若部分接口受限将自动退而求其次使用基础数据...`,
          );
        });
        currentTiers = enrichedTiers;
        onUpdateTiers?.(enrichedTiers);
      } catch {
        // Fallback to existing tiers basic data
        currentTiers = tiers;
      } finally {
        setIsEnrichingBgm(false);
        setEnrichProgressText(null);
      }

      const freshPrompt = buildTasteReportPrompt(currentTiers, comments, selectedPersona.id, {
        persona: selectedPersona,
        worldBookEntries,
        d0Prompt: aiConfig.d0Prompt || '',
        gradingSystem,
      });

      let response: Response;
      if (!trimmedKey) {
        response = await fetchAppApi('/api/gemini/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: aiConfig.model.trim() || 'gemini-2.5-flash',
            prompt: freshPrompt,
          }),
        });
        if (!response.ok || !response.body) {
          setStudioTab('api');
          setShowStudioPanel(true);
          throw new Error('请先在「API 设置」中填写你的 API Key');
        }
      } else {
        let endpoint = trimmedBaseUrl.replace(/\/+$/, '');
        if (!endpoint.endsWith('/chat/completions')) {
          endpoint = `${endpoint}/chat/completions`;
        }

        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${trimmedKey}`,
            },
            body: JSON.stringify({
              model: aiConfig.model.trim() || 'gemini-2.5-flash',
              messages: [{ role: 'user', content: freshPrompt }],
              stream: true,
            }),
          });
        } catch {
          // Fallback to proxy if running locally and custom baseUrl blocks browser CORS
          response = await fetchAppApi('/api/ai/custom-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseUrl: trimmedBaseUrl,
              apiKey: trimmedKey,
              model: aiConfig.model.trim() || 'gemini-2.5-flash',
              prompt: freshPrompt,
            }),
          });
        }
      }

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        throw new Error(`API 请求失败 (${response.status}): ${errText.slice(0, 160)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              throw new Error(
                typeof parsed.error === 'string'
                  ? parsed.error
                  : parsed.error.message || 'API 返回错误',
              );
            }
            const deltaText =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.message?.content ??
              parsed.text ??
              '';
            if (deltaText) {
              accumulated += deltaText;
              setStreamingText(accumulated);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }

      if (accumulated.trim()) {
        onSaveReport(accumulated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成报告时发生未知错误');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendReply = async (customText?: string) => {
    const content = (customText ?? replyInput).trim();
    if (!content || isSendingReply) return;

    const trimmedKey = aiConfig.apiKey.trim();
    const trimmedBaseUrl = aiConfig.baseUrl.trim();

    const nextUserMsg = { role: 'user' as const, content };
    const updatedHistory = [...replyMessages, nextUserMsg];
    setReplyMessages(updatedHistory);
    setReplyInput('');
    setIsSendingReply(true);
    setError(null);

    try {
      const replyStyle = selectedPersona.id === 'feiyu'
        ? '恢复简短聊天模式，通常一两句、不超过三行，不用 Markdown，不要重写或总结整份报告；主人明确追问细节时可以用几个短段落展开'
        : '100~280字左右';
      const conversationPrompt = normalizeReportMarkup(`${assembledPrompt}\n\n---\n【已生成的评鉴报告】：\n${activeReportText}\n\n---\n【后续对话记录】：\n${updatedHistory
        .map(m => `${m.role === 'user' ? '用户' : selectedPersona.displayName}: ${m.content}`)
        .join('\n')}\n\n请继续以「${selectedPersona.displayName}」的人设直接回复用户的最新发言（保持人设语气，可自然引用作品《作品名》与【角色名】，${replyStyle}）：`);

      let response: Response;
      if (!trimmedKey) {
        response = await fetchAppApi('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: aiConfig.model.trim() || 'gemini-2.5-flash',
            prompt: conversationPrompt,
          }),
        });
        if (!response.ok) {
          setStudioTab('api');
          setShowStudioPanel(true);
          throw new Error('请先在「API 设置」中填写你的 API Key 才能继续对话');
        }
      } else {
        let endpoint = trimmedBaseUrl.replace(/\/+$/, '');
        if (!endpoint.endsWith('/chat/completions')) {
          endpoint = `${endpoint}/chat/completions`;
        }

        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${trimmedKey}`,
            },
            body: JSON.stringify({
              model: aiConfig.model.trim() || 'gemini-2.5-flash',
              messages: [{ role: 'user', content: conversationPrompt }],
              stream: false,
            }),
          });
        } catch {
          response = await fetchAppApi('/api/ai/custom-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseUrl: trimmedBaseUrl,
              apiKey: trimmedKey,
              model: aiConfig.model.trim() || 'gemini-2.5-flash',
              prompt: conversationPrompt,
            }),
          });
        }
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`回复请求失败 (${response.status}): ${errText.slice(0, 120)}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let replyText = '';
      if (contentType.includes('text/event-stream')) {
        const raw = await response.text();
        for (const line of raw.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const p = t.slice(5).trim();
          if (!p || p === '[DONE]') continue;
          try {
            const j = JSON.parse(p);
            replyText += j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
          } catch {
            // ignore
          }
        }
      } else {
        const data = await response.json();
        replyText =
          data.choices?.[0]?.message?.content ??
          data.choices?.[0]?.delta?.content ??
          data.text ??
          '';
      }

      setReplyMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: replyText.trim() || '（对方似乎陷入了沉思，没有返回内容）',
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送回复时出错');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(assembledPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <section id="ai-report" className="pt-8 pb-8">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 mb-6 border-b border-white/[0.07]">
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-1.5">
            AI TASTE CRITIQUE
          </p>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            个人品味深度锐评
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Persona Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="persona-select" className="text-xs text-white/55 whitespace-nowrap">
              人设:
            </label>
            <select
              id="persona-select"
              data-testid="persona-select"
              value={selectedPersona.id}
              onChange={e => handleSelectPersona(e.target.value)}
              className="px-3.5 py-2 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-white focus:outline-none focus:border-white/35 cursor-pointer"
            >
              {personas.map(p => (
                <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* World Book Button */}
          <button
            type="button"
            data-testid="toggle-worldbook-btn"
            onClick={() => {
              if (showStudioPanel && studioTab === 'worldbook') {
                setShowStudioPanel(false);
              } else {
                setStudioTab('worldbook');
                setShowStudioPanel(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
              showStudioPanel && studioTab === 'worldbook'
                ? 'bg-white text-zinc-950 border-white font-semibold'
                : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.1] text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>全局世界书 ({enabledWorldBookCount}项启用)</span>
          </button>

          {/* Persona & API Settings Button */}
          <button
            type="button"
            data-testid="toggle-ai-config-btn"
            onClick={() => {
              if (showStudioPanel && studioTab !== 'worldbook') {
                setShowStudioPanel(false);
              } else {
                setStudioTab('personas');
                setShowStudioPanel(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
              showStudioPanel && studioTab !== 'worldbook'
                ? 'bg-white text-zinc-950 border-white font-semibold'
                : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.09] text-white/85'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>人设与 API 设置</span>
          </button>

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{selectedPersona.displayName} 正在撰写...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>生成 AI 锐评</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Configuration Panel */}
      {showStudioPanel && (
        <div
          data-testid="ai-studio-panel"
          className="mb-6 rounded-[24px] p-6 apple-glass-panel space-y-5 border border-white/[0.12]"
        >
          {/* Clean Tab Bar */}
          <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-white/[0.08]">
            <button
              type="button"
              data-testid="tab-worldbook"
              onClick={() => setStudioTab('worldbook')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                studioTab === 'worldbook'
                  ? 'bg-white text-zinc-950'
                  : 'bg-white/[0.05] text-white/70 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>全局世界书</span>
            </button>

            <button
              type="button"
              data-testid="tab-personas"
              onClick={() => setStudioTab('personas')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                studioTab === 'personas'
                  ? 'bg-white text-zinc-950'
                  : 'bg-white/[0.05] text-white/70 hover:text-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>人设设置</span>
            </button>

            <button
              type="button"
              data-testid="tab-api"
              onClick={() => setStudioTab('api')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                studioTab === 'api'
                  ? 'bg-white text-zinc-950'
                  : 'bg-white/[0.05] text-white/70 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>API 设置</span>
            </button>

            <button
              type="button"
              data-testid="tab-prompt-preview"
              onClick={() => setStudioTab('preview')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                studioTab === 'preview'
                  ? 'bg-white text-zinc-950'
                  : 'bg-white/[0.05] text-white/70 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Prompt 预览</span>
            </button>
          </div>

          {/* TAB 1: GLOBAL WORLD BOOK (Left = Entry Cards including Permanent D0 Card; Right = 编辑词条 Editor Panel) */}
          {studioTab === 'worldbook' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Cols: World Book Entry Cards List */}
              <div className="lg:col-span-5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-white/75" />
                    <span>全局世界书词条列表</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-white/50">
                      已启用 {enabledWorldBookCount} / {worldBookEntries.length}
                    </span>
                    <button
                      type="button"
                      data-testid="add-worldbook-entry-btn"
                      onClick={() => setShowNewEntryForm(prev => !prev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>新增词条</span>
                    </button>
                  </div>
                </div>

                {showNewEntryForm && (
                  <div className="p-3.5 rounded-2xl bg-white/[0.05] border border-white/20 space-y-2.5">
                    <input
                      type="text"
                      value={newEntryTitle}
                      onChange={e => setNewEntryTitle(e.target.value)}
                      placeholder="词条标题（如：2025新番补充 / 个人偏好补充）"
                      className="w-full px-3 py-1.5 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
                    />
                    <input
                      type="text"
                      value={newEntryShortDesc}
                      onChange={e => setNewEntryShortDesc(e.target.value)}
                      placeholder="简短摘要（可选，展示在左侧卡片上）"
                      className="w-full px-3 py-1.5 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
                    />
                    <textarea
                      rows={3}
                      value={newEntryContent}
                      onChange={e => setNewEntryContent(e.target.value)}
                      placeholder="词条详细内容..."
                      className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white/90 focus:outline-none focus:border-white/40"
                    />
                    <PromptPlacementControls label="新词条" value={newEntryPlacement} showScope onChange={patch => setNewEntryPlacement(prev => ({ ...prev, ...patch }))} />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewEntryForm(false)}
                        className="px-3 py-1 rounded-lg text-xs text-white/60 hover:text-white cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleAddWorldBookEntry}
                        disabled={!newEntryTitle.trim() || !newEntryContent.trim()}
                        className="px-3.5 py-1 rounded-lg bg-white text-zinc-950 text-xs font-bold disabled:opacity-40 cursor-pointer"
                      >
                        保存词条
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-white/50 leading-relaxed">按角色设定前 → 角色卡 → 角色设定后 → 作品资料 → D0 组装。所有条目都可修改、关闭或删除。</p>
                <div className="space-y-2.5">
                  {worldBookEntries.length === 0 && <p className="p-4 text-xs text-white/50">还没有世界书条目，点击「新增词条」添加。</p>}
                  {sortPromptEntries(worldBookEntries).map(entry => {
                    const isSelected = selectedWorldBookEntry?.id === entry.id;
                    const appliesToReport = appliesToWorldBookScope(entry, 'report');
                    return (
                      <div
                        key={entry.id}
                        data-testid={`wb-card-${entry.id}`}
                        onClick={() => setSelectedEntryId(entry.id)}
                        className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-white/[0.11] border-white/40 text-white shadow-md'
                            : entry.enabled && appliesToReport
                            ? 'bg-white/[0.06] border-white/15 text-white hover:bg-white/[0.09]'
                            : 'bg-white/[0.02] border-white/[0.07] text-white/50 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="text-xs font-bold text-white leading-snug">
                              {entry.title}
                            </span>

                              <button
                                type="button"
                                role="switch"
                                aria-checked={entry.enabled && appliesToReport}
                                aria-label={`启用 ${entry.title}`}
                                disabled={!appliesToReport}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleToggleWorldBookEntry(entry.id);
                                }}
                                className={`w-9 h-5 rounded-full shrink-0 transition-colors cursor-pointer relative ${
                                  entry.enabled && appliesToReport ? 'bg-white' : 'bg-white/20'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
                                    entry.enabled && appliesToReport
                                      ? 'translate-x-4 bg-zinc-950'
                                      : 'translate-x-0 bg-white'
                                  }`}
                                />
                              </button>
                          </div>

                          <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2">
                            {entry.shortDesc || entry.content.slice(0, 60)}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-white/[0.07] flex items-center justify-between">
                          <span className="text-[10px] font-mono text-white/45">
                            {describePromptPlacement(entry)} · {WORLD_BOOK_SCOPE_LABELS[entry.scope || 'all']}
                          </span>
                          <span className="text-[11px] font-semibold text-white/85 underline">
                            {isSelected ? '正在右侧编辑' : '编辑词条'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right 7 Cols: 编辑词条 (Entry Editor Panel) */}
              <div
                data-testid="wb-editor-panel"
                className="lg:col-span-7 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.1] flex flex-col space-y-4"
              >
                {selectedWorldBookEntry && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                      <div className="flex items-center gap-2">
                        <Edit3 className="w-4 h-4 text-white/75" />
                        <h4 className="text-sm font-bold text-white">
                          编辑词条：{selectedWorldBookEntry.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteWorldBookEntry(selectedWorldBookEntry.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>删除词条</span>
                          </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-white/55 mb-1">词条名称</label>
                        <input
                          type="text"
                          data-testid="wb-entry-title-input"
                          value={selectedWorldBookEntry.title}
                          onChange={e =>
                            handleUpdateWorldBookEntry(selectedWorldBookEntry.id, {
                              title: e.target.value,
                            })
                          }
                          className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-bold text-white focus:outline-none focus:border-white/40"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-white/55 mb-1">卡片简述</label>
                        <input
                          type="text"
                          data-testid="wb-entry-desc-input"
                          value={selectedWorldBookEntry.shortDesc}
                          onChange={e =>
                            handleUpdateWorldBookEntry(selectedWorldBookEntry.id, {
                              shortDesc: e.target.value,
                            })
                          }
                          className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white focus:outline-none focus:border-white/40"
                        />
                      </div>
                    </div>

                    <PromptPlacementControls value={selectedWorldBookEntry} showScope onChange={patch => handleUpdateWorldBookEntry(selectedWorldBookEntry.id, patch)} />
                    <div className="flex-1 flex flex-col">
                      <label className="block text-[11px] text-white/55 mb-1">
                        词条 Prompt 内容
                      </label>
                      <textarea
                        data-testid="wb-entry-content-input"
                        rows={12}
                        value={selectedWorldBookEntry.content}
                        onChange={e =>
                          handleUpdateWorldBookEntry(selectedWorldBookEntry.id, {
                            content: e.target.value,
                          })
                        }
                        className="w-full flex-1 px-4 py-3 rounded-xl bg-black/50 border border-white/[0.12] text-xs font-mono text-white/90 leading-relaxed focus:outline-none focus:border-white/40"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PERSONA SETTINGS (Simplified: ONLY Name, Avatar URL, and a single Prompt box!) */}
          {studioTab === 'personas' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 4 Cols: Persona List */}
              <div className="lg:col-span-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">人设列表</h3>
                  <button
                    type="button"
                    data-testid="create-custom-persona-btn"
                    onClick={handleCreateCustomPersona}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>新建人设</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {personas.map(p => {
                    const isActive = p.id === selectedPersona.id;
                    const isEditing = p.id === editingPersona.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setEditingPersonaId(p.id);
                          handleSelectPersona(p.id);
                        }}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isEditing
                            ? 'bg-white/[0.11] border-white/35'
                            : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={p.avatarUrl}
                            alt={p.displayName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover border border-white/20 shrink-0 bg-zinc-900"
                          />
                          <span className="text-xs font-bold text-white truncate">
                            {p.displayName}
                          </span>
                        </div>

                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-white text-zinc-950 text-[10px] font-bold shrink-0">
                            当前使用
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right 8 Cols: Single-Prompt Persona Editor */}
              <div className="lg:col-span-8 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.09] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                  <h4 className="text-sm font-bold text-white">
                    编辑人设：{editingPersona.displayName}
                  </h4>

                  <div className="flex items-center gap-2">
                    {editingPersona.isCustom ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomPersona(editingPersona.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-200 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>删除人设</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleResetBuiltInPersona(editingPersona.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-white/75 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>恢复默认</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1">人设名称</label>
                    <input
                      type="text"
                      data-testid="persona-name-input"
                      value={editingPersona.displayName}
                      onChange={e =>
                        handleUpdatePersona(editingPersona.id, {
                          displayName: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-bold text-white focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-white/55 mb-1">头像图片 URL</label>
                    <input
                      type="text"
                      value={editingPersona.avatarUrl}
                      onChange={e =>
                        handleUpdatePersona(editingPersona.id, {
                          avatarUrl: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-white/55 mb-1">自定义人设 Prompt</label>
                  <textarea
                    data-testid="persona-prompt-input"
                    rows={12}
                    value={editingPersona.prompt}
                    onChange={e =>
                      handleUpdatePersona(editingPersona.id, {
                        prompt: e.target.value,
                      })
                    }
                    placeholder="输入该人设的完整 Prompt..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-mono text-white/90 leading-relaxed focus:outline-none focus:border-white/40"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: API SETTINGS (With One-Click Model Fetching & Dropdown Selection) */}
          {studioTab === 'api' && (
            <div className="max-w-2xl space-y-4">
              <div>
                <span className="block text-[11px] text-white/50 mb-1.5">
                  常用接口一键填入:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {API_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        updateAiConfig(prev => ({
                          ...prev,
                          baseUrl: preset.baseUrl,
                          model: preset.model,
                        }))
                      }
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-medium text-white/90 transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="custom-base-url"
                  className="block text-xs font-medium text-white/75 mb-1"
                >
                  API Base URL
                </label>
                <input
                  id="custom-base-url"
                  type="text"
                  value={aiConfig.baseUrl}
                  onChange={e =>
                    updateAiConfig(prev => ({ ...prev, baseUrl: e.target.value }))
                  }
                  placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.12] text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="custom-api-key"
                    className="block text-xs font-medium text-white/75 mb-1 flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3 text-white/50" />
                    <span>API Key</span>
                  </label>
                  <input
                    id="custom-api-key"
                    type="password"
                    value={aiConfig.apiKey}
                    onChange={e =>
                      updateAiConfig(prev => ({ ...prev, apiKey: e.target.value }))
                    }
                    placeholder="填写你的 API Key..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.12] text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="custom-model-name"
                      className="text-xs font-medium text-white/75 flex items-center gap-1"
                    >
                      <Cpu className="w-3 h-3 text-white/50" />
                      <span>模型名称 (Model)</span>
                    </label>
                    <button
                      type="button"
                      data-testid="fetch-models-btn"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isFetchingModels ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>拉取中...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>拉取模型列表</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {Array.isArray(aiConfig.availableModels) &&
                      aiConfig.availableModels.length > 0 && (
                        <select
                          data-testid="model-select-dropdown"
                          aria-label="选择已拉取的模型"
                          value={aiConfig.model}
                          onChange={e =>
                            updateAiConfig(prev => ({ ...prev, model: e.target.value }))
                          }
                          className="w-full px-3.5 py-2 rounded-xl bg-white/[0.08] border border-white/25 text-xs font-mono font-bold text-white focus:outline-none focus:border-white/50 cursor-pointer"
                        >
                          {aiConfig.availableModels.map(m => (
                            <option key={m} value={m} className="bg-zinc-900 text-white">
                              {m}
                            </option>
                          ))}
                        </select>
                      )}

                    <input
                      id="custom-model-name"
                      type="text"
                      value={aiConfig.model}
                      onChange={e =>
                        updateAiConfig(prev => ({ ...prev, model: e.target.value }))
                      }
                      placeholder="点击上方「拉取模型列表」或手动输入..."
                      className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.12] text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>
              </div>

              {fetchModelsMsg && (
                <div
                  className={`px-3.5 py-2 rounded-xl text-xs border ${
                    fetchModelsMsg.type === 'ok'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                  }`}
                >
                  {fetchModelsMsg.text}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: READ-ONLY PROMPT PREVIEW */}
          {studioTab === 'preview' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <span className="block text-xs text-white/75 font-medium">
                    当前合成 Prompt 预览（含作品基础数据、多体裁 Infobox、角色人气短评与 BGM 网友吐槽箱）
                  </span>
                  <span role="status" className="block text-[11px] text-white/45">
                    {enrichProgressText || (autoEnrichStatus?.active
                      ? `正在补充 Bangumi 资料：${autoEnrichStatus.done} / ${autoEnrichStatus.total}`
                      : promptRefreshStatus || summarizeDiscussionData(Object.values(tiers).flat()))}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRefreshPrompt()}
                  disabled={isEnrichingBgm || isGenerating || autoEnrichStatus?.active || !Object.values(tiers).some(items => items.some(item => !item.isCustom))}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/15 text-xs text-white/85 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isEnrichingBgm ? 'animate-spin' : ''}`} />
                  <span>{isEnrichingBgm ? '正在刷新…' : '刷新 Prompt'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制完整 Prompt</span>
                    </>
                  )}
                </button>
                </div>
              </div>

              <pre data-testid="report-full-prompt-preview" className="w-full max-h-80 overflow-y-auto p-4 rounded-2xl bg-black/55 border border-white/[0.1] text-xs font-mono text-white/85 whitespace-pre-wrap leading-relaxed">
                {assembledPrompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {(enrichProgressText || autoEnrichStatus?.active) && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-500/12 border border-rose-500/30 text-xs text-rose-200 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-rose-300 animate-spin shrink-0" />
          <span>
            {enrichProgressText ||
              `正在后台自动同步 BGM 角色人气与网友吐槽数据 (${autoEnrichStatus?.done || 0}/${autoEnrichStatus?.total || 0})，若接口受限将自动降级使用基础数据...`}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleGenerateReport}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-white cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>重试</span>
          </button>
        </div>
      )}

      {/* Main Report Card */}
      <div className="relative w-full rounded-[24px] overflow-hidden apple-glass-panel">
        {(activeReportText.trim() || isGenerating) && <div className="px-6 sm:px-10 py-4 border-b border-white/[0.07] bg-white/[0.015] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/20 shadow-md shrink-0 bg-zinc-900">
              <img
                src={selectedPersona.avatarUrl}
                alt={selectedPersona.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">
                  {selectedPersona.displayName}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-[10px] font-mono text-white/60">
                  作品封面 + 角色头像 + HTML 载体可视化
                </span>
              </div>
              <p className="text-[11px] text-white/45 mt-0.5">
                入榜与生成时自动读取 BGM 全分类 Infobox、角色人气热评与网友吐槽（接口受限时自动降级为基础数据）
              </p>
            </div>
          </div>

          {autoEnrichStatus?.active && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.1] text-[11px] text-white/70">
              <Loader2 className="w-3 h-3 animate-spin text-rose-300" />
              <span>
                自动补全深度数据 ({autoEnrichStatus.done}/{autoEnrichStatus.total})
              </span>
            </div>
          )}
        </div>

        }
        <div className="px-6 sm:px-10 py-8 sm:py-10">
          <div className="max-w-[1100px] mx-auto space-y-5">
            {parsedReportBlocks.map((block, idx) => {
              if (block.type === 'html-viz') {
                return (
                  <HtmlSandboxRenderer
                    key={`html-viz-${idx}`}
                    rawHtml={block.htmlContent}
                    summary={block.summary}
                    animeByTitle={animeByTitle}
                    characterByName={characterByName}
                    persona={selectedPersona}
                  />
                );
              }

              if (block.type === 'html-viz-loading') {
                return (
                  <div
                    key={`html-loading-${idx}`}
                    className="my-5 p-6 rounded-2xl border border-rose-500/30 bg-rose-950/15 flex items-center gap-3.5 animate-pulse"
                  >
                    <Loader2 className="w-5 h-5 text-rose-400 animate-spin shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-rose-200">
                        ⚡ 正在渲染嵌入式前端载体...
                      </div>
                      <div className="text-[11px] text-rose-300/60 mt-0.5">
                        正在生成互动展示，请稍候…
                      </div>
                    </div>
                  </div>
                );
              }

              // Unified Markdown Narrative & Critique Flow
              return (
                <div
                  key={`narrative-${idx}`}
                  className="report-narrative"
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdownSegmentToHtml(block.markdown),
                  }}
                />
              );
            })}

            {!activeReportText.trim() && !isGenerating && (
              <div data-testid="empty-report" className="py-10 text-center">
                <p className="text-sm font-medium text-white/70">还没有 AI 评鉴</p>
                <p className="mt-2 text-xs leading-relaxed text-white/45">添加作品并完成评分后，可以生成报告或导入已有备份。</p>
              </div>
            )}

            {/* Follow-up conversation appears only after there is a report or saved conversation. */}
            {(activeReportText.trim() || replyMessages.length > 0) && <div
              data-testid="report-reply-section"
              className="mt-8 pt-6 border-t border-white/[0.08]"
            >
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.02] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={selectedPersona.avatarUrl}
                      alt={selectedPersona.displayName}
                      className="w-7 h-7 rounded-lg object-cover border border-white/15 bg-zinc-900"
                    />
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <span>继续对话 · 回复 {selectedPersona.displayName}</span>
                      </div>
                      <div className="text-[11px] text-white/45">
                        对评鉴内容有不同看法或想继续聊聊？直接发送消息继续交流
                      </div>
                    </div>
                  </div>
                  {replyMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setReplyMessages([])}
                      className="text-[11px] text-white/45 hover:text-white/80 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
                    >
                      清空对话
                    </button>
                  )}
                </div>

                {replyMessages.length > 0 && (
                  <div className="space-y-3 mb-4 max-h-96 overflow-y-auto pr-1">
                    {replyMessages.map((msg, mIdx) => (
                      <div
                        key={mIdx}
                        className={`flex items-start gap-2.5 ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <img
                            src={selectedPersona.avatarUrl}
                            alt={selectedPersona.displayName}
                            className="w-7 h-7 rounded-lg object-cover border border-white/15 shrink-0 mt-0.5"
                          />
                        )}
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-[13.5px] leading-[2.0] ${
                            msg.role === 'user'
                              ? 'bg-rose-500/20 border border-rose-400/35 text-rose-50'
                              : 'bg-white/[0.04] border border-white/[0.1] text-white/90'
                          }`}
                        >
                          {msg.role === 'assistant' ? (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: formatMarkdownSegmentToHtml(msg.content),
                              }}
                            />
                          ) : (
                            msg.content
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyInput}
                    onChange={e => setReplyInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder={`回复 ${selectedPersona.displayName}，按 Enter 发送...`}
                    className="flex-1 bg-black/35 border border-white/[0.1] focus:border-white/25 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-white/30 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendReply()}
                    disabled={isSendingReply || !replyInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.14] disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    {isSendingReply ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>回复中...</span>
                      </>
                    ) : (
                      <span>发送</span>
                    )}
                  </button>
                </div>
              </div>
            </div>}
          </div>
        </div>
      </div>
    </section>
  );
};
