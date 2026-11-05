import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toPng } from 'html-to-image';
import type {
  AIConfig,
  AnimeItem,
  BangumiSyncConfig,
  CommentCardStyle,
  CommentItem,
  TierGradingSystem,
  TierMap,
  TierRowStyle,
  TierScore,
} from './types';
import {
  ALL_TIER_SCORES,
  DEFAULT_VISIBLE_TIERS,
  LETTER_DEFAULT_VISIBLE_TIERS,
  LETTER_TIER_SCORES,
  DEFAULT_WORLD_BOOK_ENTRIES,
  DEFAULT_PERSONAS,
  createEmptyTierMap,
  normalizeTierMap,
  normalizeVisibleTiers,
  mergeTierMetadata,
  consolidateTierMapForLetterMode,
  restoreTierMapForNumericMode,
  scoreToCanonicalLetterScore,
  addAnimeToTier,
  removeAnimeFromBoard,
  moveAnimeBetweenTiers,
  getBoardStats,
  formatTierBadgeText,
  createCustomWorkId,
} from './lib/tierLogic';
import {
  DEFAULT_STUDIO_PROMPT_RULES_CONFIG,
  DEFAULT_STUDIO_AI_COMPANIONS,
} from './lib/studioDirector';
import {
  DEFAULT_USER_BGM_TOKEN,
  extractTitleFromFileName,
  compressImageFileToDataUrl,
  fetchBangumiDeepSubjectData,
} from './lib/bangumiApi';
import { DEFAULT_THEME_VERSION, getInitialThemeId, getThemeById } from './lib/themes';
import { HeaderBar } from './components/HeaderBar';
import { TierRow } from './components/TierRow';
import { UnrankedPoolSidebar } from './components/UnrankedPoolSidebar';
import { SearchModal, type SearchTargetDestination } from './components/SearchModal';
import { AnimeDetailModal } from './components/AnimeDetailModal';
import { TagAnalysisSection } from './components/TagAnalysisSection';
import { CommentsSection } from './components/CommentsSection';
import {
  TasteReportSection,
  loadSavedAiConfig,
  AI_CONFIG_STORAGE_KEY,
} from './components/TasteReportSection';
import { SettingsDrawer } from './components/SettingsDrawer';
import { BangumiSyncModal, type BgmSyncTabMode } from './components/BangumiSyncModal';
import { PosterWallModal } from './components/PosterWallModal';
import { AmbientBackgroundCanvas } from './components/AmbientBackgroundCanvas';
import { RecordingStudioPage } from './components/RecordingStudioPage';
import { Tv, BookOpen, Gamepad2, Github } from 'lucide-react';

import { STORAGE_KEYS, STUDIO_STORAGE_KEYS } from './lib/persistenceSchema';
import { appStorage, flushStorage, importStorage } from './lib/appStorage';
import { createBackup, parseBackup } from './lib/backup';
import { downloadBackup } from './components/StorageStatus';

export function App() {
  const boardRef = useRef<HTMLDivElement>(null);


  // Core Persistent State
  const [boardTitle, setBoardTitle] = useState<string>(() => {
    const raw = appStorage.getItem(STORAGE_KEYS.TITLE) || '动画 Tier List 鉴赏排行';
    return raw.replace(/^🍗\s*/, '');
  });

  const [tiers, setTiers] = useState<TierMap>(() => {
    try {
      const saved = appStorage.getItem(STORAGE_KEYS.TIERS);
      if (saved) return normalizeTierMap(JSON.parse(saved));
      return createEmptyTierMap();
    } catch {
      return createEmptyTierMap();
    }
  });

  const [unrankedPool, setUnrankedPool] = useState<AnimeItem[]>(() => {
    try {
      const saved = appStorage.getItem(STORAGE_KEYS.UNRANKED_POOL);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(item => item && typeof item.id === 'number' && typeof item.title === 'string');
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [bgmSyncConfig, setBgmSyncConfig] = useState<BangumiSyncConfig>(() => {
    try {
      const saved = appStorage.getItem(STORAGE_KEYS.BGM_SYNC);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          token: parsed.token || DEFAULT_USER_BGM_TOKEN,
          username: parsed.username,
          nickname: parsed.nickname,
          avatar: parsed.avatar,
          lastSyncedAt: parsed.lastSyncedAt,
        };
      }
    } catch {
      // ignore
    }
    return {
      token: DEFAULT_USER_BGM_TOKEN,
    };
  });

  const [aiConfig, setAiConfig] = useState<AIConfig>(() => loadSavedAiConfig());

  const [isPoolOpen, setIsPoolOpen] = useState<boolean>(true);
  const [poolDockSide, setPoolDockSide] = useState<'left' | 'right'>('right');
  const [isRecordingMode, setIsRecordingMode] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.search.includes('studio=1');
  });

  const [gradingSystem, setGradingSystem] = useState<TierGradingSystem>(() => {
    const saved = appStorage.getItem(STORAGE_KEYS.GRADING_SYSTEM);
    return saved === 'letter' ? 'letter' : 'numeric';
  });

  const [visibleTiers, setVisibleTiers] = useState<TierScore[]>(() => {
    const savedSystem = appStorage.getItem(STORAGE_KEYS.GRADING_SYSTEM) === 'letter' ? 'letter' : 'numeric';

    try {
      const saved = appStorage.getItem(STORAGE_KEYS.VISIBLE_TIERS);
      if (saved) {
        return normalizeVisibleTiers(JSON.parse(saved), savedSystem);
      }
    } catch {
      // ignore
    }
    return normalizeVisibleTiers(undefined, savedSystem);
  });

  const [exportHideEmptyTiers, setExportHideEmptyTiers] = useState<boolean>(() => {
    const saved = appStorage.getItem(STORAGE_KEYS.EXPORT_HIDE_EMPTY);
    return saved === null ? true : saved === 'true';
  });

  const [showTitles, setShowTitles] = useState<boolean>(() => {
    const saved = appStorage.getItem(STORAGE_KEYS.SHOW_TITLES);
    return saved === null ? true : saved === 'true';
  });

  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    return getInitialThemeId(appStorage.getItem(STORAGE_KEYS.THEME), appStorage.getItem(STORAGE_KEYS.THEME_DEFAULTS_VERSION));
  });

  const [tierRowStyle, setTierRowStyle] = useState<TierRowStyle>(() => {
    const saved = appStorage.getItem(STORAGE_KEYS.TIER_ROW_STYLE);
    if (
      saved === 'ambient-glass' ||
      saved === 'minimal-blur' ||
      saved === 'floating-split' ||
      saved === 'pure-transparent'
    ) {
      return saved;
    }
    return 'ambient-glass';
  });

  const [tierRowOpacity, setTierRowOpacity] = useState<number>(() => {
    const saved = appStorage.getItem(STORAGE_KEYS.TIER_ROW_OPACITY);
    if (saved !== null) {
      const num = Number(saved);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) return num;
    }
    return 82;
  });

  const [customBgUrl, setCustomBgUrl] = useState<string>(() => {
    return appStorage.getItem(STORAGE_KEYS.CUSTOM_BG) || '';
  });

  const [useCustomBg, setUseCustomBg] = useState<boolean>(() => appStorage.getItem(STORAGE_KEYS.USE_CUSTOM_BG) === 'true');
  const [enableParticles, setEnableParticles] = useState<boolean>(() => appStorage.getItem(STORAGE_KEYS.PARTICLES) === null ? false : appStorage.getItem(STORAGE_KEYS.PARTICLES) === 'true');
  const [enableGlow, setEnableGlow] = useState<boolean>(() => appStorage.getItem(STORAGE_KEYS.GLOW) === null ? true : appStorage.getItem(STORAGE_KEYS.GLOW) === 'true');
  const [enableGlassBlur, setEnableGlassBlur] = useState<boolean>(() => appStorage.getItem(STORAGE_KEYS.GLASS_BLUR) === null ? true : appStorage.getItem(STORAGE_KEYS.GLASS_BLUR) === 'true');
  const [glassBlurPx, setGlassBlurPx] = useState<number>(() => Number(appStorage.getItem(STORAGE_KEYS.GLASS_BLUR_PX) ?? 10));

  const [comments, setComments] = useState<CommentItem[]>(() => {
    try {
      const saved = appStorage.getItem(STORAGE_KEYS.COMMENTS);
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) return parsed.filter(item => item && typeof item.text === 'string' && typeof item.animeTitle === 'string'); }
    } catch {
      // ignore
    }
    return [];
  });

  const [savedReport, setSavedReport] = useState<string>(() => {
    return appStorage.getItem(STORAGE_KEYS.TASTE_REPORT) || '';
  });

  // UI Ephemeral State
  const [highlightedTag, setHighlightedTag] = useState<string | null>(null);
  const [searchModalState, setSearchModalState] = useState<{
    isOpen: boolean;
    targetScore: SearchTargetDestination;
  }>({ isOpen: false, targetScore: 'pool' });

  const [isBgmSyncModalOpen, setIsBgmSyncModalOpen] = useState<boolean>(false);
  const [bgmSyncModalTab, setBgmSyncModalTab] = useState<BgmSyncTabMode>('pull');
  const [isPosterWallModalOpen, setIsPosterWallModalOpen] = useState<boolean>(false);

  const [detailTarget, setDetailTarget] = useState<{
    anime: AnimeItem;
    score: SearchTargetDestination;
  } | null>(null);

  const [commentTarget, setCommentTarget] = useState<{
    anime: AnimeItem;
    score: TierScore;
  } | null>(null);

  const [settingsState, setSettingsState] = useState<{
    isOpen: boolean;
    tab: 'general' | 'themes' | 'data';
  }>({ isOpen: false, tab: 'themes' });

  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3000);
  };

  const [autoEnrichStatus, setAutoEnrichStatus] = useState<{
    active: boolean;
    done: number;
    total: number;
  }>({ active: false, done: 0, total: 0 });
  const enrichingIdsRef = useRef<Set<number>>(new Set());
  const isEnrichRunnerActiveRef = useRef<boolean>(false);
  const isUnmountedRef = useRef<boolean>(false);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);

  // Automatically enrich ranked works on the board in the background (batched to avoid UI main-thread lag)
  useEffect(() => {
    if (isEnrichRunnerActiveRef.current) return;

    const safeTiers = normalizeTierMap(tiers);
    const pendingItems: AnimeItem[] = [];
    for (const score of ALL_TIER_SCORES) {
      const list = safeTiers[String(score)] || [];
      for (const item of list) {
        if (
          item &&
          item.id > 0 &&
          !item.isCustom &&
          !item.deepEnriched &&
          !enrichingIdsRef.current.has(item.id)
        ) {
          pendingItems.push(item);
        }
      }
    }

    if (pendingItems.length === 0) return;

    isEnrichRunnerActiveRef.current = true;
    pendingItems.forEach(i => enrichingIdsRef.current.add(i.id));
    setAutoEnrichStatus({ active: true, done: 0, total: pendingItems.length });

    (async () => {
      try {
        await new Promise(r => setTimeout(r, 900));
        let doneCount = 0;
        const batchSize = 2;
        let pendingCommitItems: AnimeItem[] = [];

        const flushPendingCommit = () => {
          if (pendingCommitItems.length === 0 || isUnmountedRef.current) return;
          const toCommit = pendingCommitItems;
          pendingCommitItems = [];
          setTiers(prev => mergeTierMetadata(prev, { '10': toCommit }));
        };

        for (let i = 0; i < pendingItems.length; i += batchSize) {
          if (isUnmountedRef.current) break;
          const batch = pendingItems.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async item => {
              try {
                const enriched = await fetchBangumiDeepSubjectData(item);
                if (!isUnmountedRef.current && enriched && enriched.id === item.id) {
                  pendingCommitItems.push(enriched);
                }
              } catch {
                // Graceful fallback: keep existing basic item untouched
              } finally {
                doneCount++;
              }
            }),
          );
          if (!isUnmountedRef.current) {
            if (pendingCommitItems.length >= 8 || doneCount >= pendingItems.length) {
              flushPendingCommit();
            }
            setAutoEnrichStatus({
              active: doneCount < pendingItems.length,
              done: doneCount,
              total: pendingItems.length,
            });
          }
          if (i + batchSize < pendingItems.length) {
            await new Promise(r => setTimeout(r, 160));
          }
        }
        flushPendingCommit();
      } finally {
        isEnrichRunnerActiveRef.current = false;
        if (!isUnmountedRef.current) {
          setAutoEnrichStatus(prev => ({ ...prev, active: false }));
        }
      }
    })();
  }, [tiers]);

  // Browser database writes are batched and mirrored to the local server.
  useEffect(() => {
    const safeTiers = normalizeTierMap(tiers);
    appStorage.setItem(STORAGE_KEYS.TIERS, JSON.stringify(safeTiers));
  }, [tiers]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.UNRANKED_POOL, JSON.stringify(unrankedPool));
  }, [unrankedPool]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.VISIBLE_TIERS, JSON.stringify(visibleTiers));
  }, [visibleTiers]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.GRADING_SYSTEM, gradingSystem);
  }, [gradingSystem]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.TITLE, boardTitle);
  }, [boardTitle]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.SHOW_TITLES, String(showTitles));
  }, [showTitles]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.EXPORT_HIDE_EMPTY, String(exportHideEmptyTiers));
  }, [exportHideEmptyTiers]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.THEME, activeThemeId);
    appStorage.setItem(STORAGE_KEYS.THEME_DEFAULTS_VERSION, DEFAULT_THEME_VERSION);
  }, [activeThemeId]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.TIER_ROW_STYLE, tierRowStyle);
  }, [tierRowStyle]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.TIER_ROW_OPACITY, String(tierRowOpacity));
  }, [tierRowOpacity]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.CUSTOM_BG, customBgUrl);
  }, [customBgUrl]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(comments));
  }, [comments]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.TASTE_REPORT, savedReport);
  }, [savedReport]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.BGM_SYNC, JSON.stringify(bgmSyncConfig));
  }, [bgmSyncConfig]);

  useEffect(() => {
    appStorage.setItem(STORAGE_KEYS.USE_CUSTOM_BG, String(useCustomBg));
    appStorage.setItem(STORAGE_KEYS.PARTICLES, String(enableParticles));
    appStorage.setItem(STORAGE_KEYS.GLOW, String(enableGlow));
    appStorage.setItem(STORAGE_KEYS.GLASS_BLUR, String(enableGlassBlur));
    appStorage.setItem(STORAGE_KEYS.GLASS_BLUR_PX, String(glassBlurPx));
    appStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(aiConfig));
  }, [useCustomBg, enableParticles, enableGlow, enableGlassBlur, glassBlurPx, aiConfig]);

  // Computed Values
  const stats = useMemo(() => getBoardStats(tiers), [tiers]);

  const existingAnimeTierMap = useMemo(() => {
    const map = new Map<number, SearchTargetDestination>();
    for (const item of unrankedPool) {
      map.set(item.id, 'pool');
    }
    for (const score of ALL_TIER_SCORES) {
      const list = tiers[String(score)] || [];
      for (const anime of list) {
        map.set(anime.id, score);
      }
    }
    return map;
  }, [tiers, unrankedPool]);

  const allExistingIds = useMemo(() => {
    return new Set<number>(existingAnimeTierMap.keys());
  }, [existingAnimeTierMap]);

  const commentedAnimeIds = useMemo(() => {
    return new Set(comments.map(c => c.animeId));
  }, [comments]);

  const hasAllHalfTiersVisible = useMemo(() => {
    return visibleTiers.length === ALL_TIER_SCORES.length;
  }, [visibleTiers]);

  const findAnimeAnywhere = (animeId: number): AnimeItem | null => {
    const fromPool = unrankedPool.find(item => item.id === animeId);
    if (fromPool) return fromPool;
    for (const score of ALL_TIER_SCORES) {
      const found = (tiers[String(score)] || []).find(item => item.id === animeId);
      if (found) return found;
    }
    return null;
  };

  // Ensure initial mount in letter mode consolidates 9-10->S, 7-8->A, 5-6->B, 3-4->C, 1-2->D
  useEffect(() => {
    if (gradingSystem === 'letter') {
      setTiers(prev => consolidateTierMapForLetterMode(prev));
      setVisibleTiers(prev => {
        const filtered = LETTER_TIER_SCORES.filter(s => prev.includes(s));
        return filtered.length > 0 ? filtered : [...LETTER_DEFAULT_VISIBLE_TIERS];
      });
    }
  }, []);

  // Handlers
  const handleChangeGradingSystem = (nextSystem: TierGradingSystem) => {
    setGradingSystem(nextSystem);
    if (nextSystem === 'letter') {
      setTiers(prev => consolidateTierMapForLetterMode(prev));
      setVisibleTiers([...LETTER_DEFAULT_VISIBLE_TIERS]);
      showToast('已切换为 S - D 五档制（9-10→S，7-8→A，5-6→B，3-4→C，1-2→D）');
    } else {
      setTiers(prev => {
        const restored = restoreTierMapForNumericMode(prev);
        const nonEmptyScores = ALL_TIER_SCORES.filter(
          s => (restored[String(s)] || []).length > 0,
        );
        const merged = new Set<TierScore>([...DEFAULT_VISIBLE_TIERS, ...nonEmptyScores]);
        setVisibleTiers(ALL_TIER_SCORES.filter(s => merged.has(s)));
        return restored;
      });
      showToast('已切换为 1 - 10 评分制');
    }
  };

  const handleToggleGradingSystem = () => {
    handleChangeGradingSystem(gradingSystem === 'numeric' ? 'letter' : 'numeric');
  };

  const handleToggleAllHalfTiers = () => {
    if (gradingSystem === 'letter') return;
    if (hasAllHalfTiersVisible) {
      setVisibleTiers(DEFAULT_VISIBLE_TIERS);
      showToast('已切换为 1-10 整数分档');
    } else {
      setVisibleTiers(ALL_TIER_SCORES);
      showToast('已开启全部 0.5 半分细分档位');
    }
  };

  const handleToggleSingleTierVisibility = (score: TierScore) => {
    setVisibleTiers(prev => {
      const exists = prev.includes(score);
      const next = exists ? prev.filter(s => s !== score) : [...prev, score];
      const allowedPool = gradingSystem === 'letter' ? LETTER_TIER_SCORES : ALL_TIER_SCORES;
      return allowedPool.filter(s => next.includes(s));
    });
  };

  const handleAddAnime = (anime: AnimeItem, destination: SearchTargetDestination) => {
    if (destination === 'pool') {
      setTiers(prev => removeAnimeFromBoard(prev, anime.id));
      setUnrankedPool(prev => {
        const filtered = prev.filter(item => item.id !== anime.id);
        return [anime, ...filtered];
      });
      setIsPoolOpen(true);
      showToast(`已将《${anime.title}》加入待排候选池`);
    } else {
      const effectiveScore =
        gradingSystem === 'letter' ? scoreToCanonicalLetterScore(destination) : destination;
      setUnrankedPool(prev => prev.filter(item => item.id !== anime.id));
      setTiers(prev =>
        addAnimeToTier(prev, effectiveScore, {
          ...anime,
          originalNumericScore: anime.originalNumericScore ?? destination,
        }),
      );
      if (!visibleTiers.includes(effectiveScore)) {
        const allowedPool = gradingSystem === 'letter' ? LETTER_TIER_SCORES : ALL_TIER_SCORES;
        setVisibleTiers(prev =>
          allowedPool.filter(s => prev.includes(s) || s === effectiveScore),
        );
      }
      showToast(
        `已将《${anime.title}》加入 ${formatTierBadgeText(effectiveScore, gradingSystem)}`,
      );
    }
  };

  // Direct Batch Image Drop / Upload Handler (auto-titles from filename)
  const handleBatchUploadImagesToPool = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(
      f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name),
    );
    if (imageFiles.length === 0) return;

    const newItems: AnimeItem[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const dataUrl = await compressImageFileToDataUrl(file);
      newItems.push({
        id: createCustomWorkId(i),
        title: extractTitleFromFileName(file.name),
        cover: dataUrl,
        category: 'anime',
        isCustom: true,
      });
    }

    setUnrankedPool(prev => [...newItems, ...prev]);
    setIsPoolOpen(true);
    showToast(`已批量导入 ${newItems.length} 张图片至候选池（已自动使用文件名作为标题）`);
  };

  const handleRenameAnimeTitle = (animeId: number, newTitle: string) => {
    setUnrankedPool(prev =>
      prev.map(item => (item.id === animeId ? { ...item, title: newTitle } : item)),
    );
    setTiers(prev => {
      const next = normalizeTierMap(prev);
      for (const k of Object.keys(next)) {
        next[k] = next[k].map(item => (item.id === animeId ? { ...item, title: newTitle } : item));
      }
      return next;
    });
    showToast(`已重命名为《${newTitle}》`);
  };

  const handleImportFromBangumiSync = (
    items: AnimeItem[],
    options: { autoPlaceByBgmRate: boolean; importBgmComments: boolean },
  ) => {
    if (items.length === 0) return;

    const toPool: AnimeItem[] = [];
    const toBoard: Array<{ item: AnimeItem; score: TierScore }> = [];
    const newComments: CommentItem[] = [];

    items.forEach((item, idx) => {
      const rate = item.userBgmRate;
      if (
        options.autoPlaceByBgmRate &&
        typeof rate === 'number' &&
        rate >= 1 &&
        rate <= 10
      ) {
        const roundedScore = (Math.round(rate * 2) / 2) as TierScore;
        const effectiveScore =
          gradingSystem === 'letter'
            ? scoreToCanonicalLetterScore(roundedScore)
            : roundedScore;
        toBoard.push({
          item: {
            ...item,
            originalNumericScore: roundedScore,
          },
          score: effectiveScore,
        });
      } else {
        toPool.push(item);
      }

      if (options.importBgmComments && item.userBgmComment?.trim()) {
        newComments.push({
          id: `bgm-c-${item.id}`,
          animeId: item.id,
          animeTitle: item.title,
          animeCover: item.cover,
          tierScore: (rate && rate >= 1 && rate <= 10 ? rate : 8) as TierScore,
          text: item.userBgmComment.trim(),
          cardStyle: (((idx % 6) + 1) as CommentCardStyle),
          updatedAt: Date.now() - idx * 1000,
        });
      }
    });

    if (toPool.length > 0) {
      setUnrankedPool(prev => {
        const incomingIds = new Set(toPool.map(i => i.id));
        const filtered = prev.filter(i => !incomingIds.has(i.id));
        return [...toPool, ...filtered];
      });
      setIsPoolOpen(true);
    }

    if (toBoard.length > 0) {
      setTiers(prev => {
        let next = normalizeTierMap(prev);
        for (const { item, score } of toBoard) {
          next = addAnimeToTier(next, score, item);
        }
        return gradingSystem === 'letter' ? consolidateTierMapForLetterMode(next) : next;
      });
      if (gradingSystem === 'letter') {
        setVisibleTiers([...LETTER_DEFAULT_VISIBLE_TIERS]);
      } else {
        const addedScores = new Set(toBoard.map(x => x.score));
        setVisibleTiers(prev =>
          ALL_TIER_SCORES.filter(s => prev.includes(s) || addedScores.has(s)),
        );
      }
    }

    if (newComments.length > 0) {
      setComments(prev => {
        const existingAnimeIds = new Set(prev.map(c => c.animeId));
        const fresh = newComments.filter(c => !existingAnimeIds.has(c.animeId));
        return [...fresh, ...prev];
      });
    }

    showToast(
      `已从 Bangumi 同步 ${items.length} 部作品（候选池 ${toPool.length} 部${
        toBoard.length > 0 ? `，入榜 ${toBoard.length} 部` : ''
      }）`,
    );
  };

  const handleRemoveAnime = (animeId: number) => {
    setTiers(prev => removeAnimeFromBoard(prev, animeId));
    setUnrankedPool(prev => prev.filter(item => item.id !== animeId));
    showToast('已移除该作品');
  };

  const handleMoveAnimeToTier = (animeId: number, targetScore: TierScore, targetIndex?: number) => {
    const effectiveScore =
      gradingSystem === 'letter' ? scoreToCanonicalLetterScore(targetScore) : targetScore;
    const poolItem = unrankedPool.find(item => item.id === animeId);
    if (poolItem) {
      setUnrankedPool(prev => prev.filter(item => item.id !== animeId));
      setTiers(prev => {
        const next = normalizeTierMap(prev);
        const targetKey = String(effectiveScore);
        const destList = [...(next[targetKey] || [])].filter(i => i.id !== animeId);
        const itemToInsert: AnimeItem = {
          ...poolItem,
          originalNumericScore: effectiveScore,
        };
        if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= destList.length) {
          destList.splice(targetIndex, 0, itemToInsert);
        } else {
          destList.push(itemToInsert);
        }
        next[targetKey] = destList;
        return next;
      });
      showToast(
        `已将《${poolItem.title}》排入 ${formatTierBadgeText(effectiveScore, gradingSystem)}`,
      );
    } else {
      setTiers(prev => moveAnimeBetweenTiers(prev, animeId, effectiveScore, targetIndex));
    }
    setDetailTarget(prev =>
      prev && prev.anime.id === animeId ? { ...prev, score: effectiveScore } : prev,
    );
  };

  const handleMoveAnimeIntoPool = (animeId: number, targetIndex?: number) => {
    const anime = findAnimeAnywhere(animeId);
    if (!anime) return;
    const wasOnBoard = !unrankedPool.some(i => i.id === animeId);
    setTiers(prev => removeAnimeFromBoard(prev, animeId));
    setUnrankedPool(prev => {
      const without = prev.filter(i => i.id !== animeId);
      if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= without.length) {
        without.splice(targetIndex, 0, anime);
        return without;
      }
      return [anime, ...without];
    });
    setIsPoolOpen(true);
    setDetailTarget(prev => (prev && prev.anime.id === animeId ? { ...prev, score: 'pool' } : prev));
    if (wasOnBoard) {
      showToast(`已将《${anime.title}》移回待排候选池`);
    }
  };

  const handleMoveAllBoardToPool = () => {
    const boardItems: AnimeItem[] = [];
    for (const score of ALL_TIER_SCORES) {
      for (const item of tiers[String(score)] || []) {
        boardItems.push(item);
      }
    }
    if (boardItems.length === 0) {
      showToast('当前榜单上没有可移入候选池的作品');
      return;
    }
    setTiers(createEmptyTierMap());
    setUnrankedPool(prev => {
      const existingIds = new Set(boardItems.map(i => i.id));
      const remainingPool = prev.filter(i => !existingIds.has(i.id));
      return [...boardItems, ...remainingPool];
    });
    setIsPoolOpen(true);
    showToast(`已将全部 ${boardItems.length} 部作品收起至侧边候选池，可以开始录屏排榜！`);
  };

  const handleClearPool = () => {
    if (unrankedPool.length === 0) return;
    const count = unrankedPool.length;
    setUnrankedPool([]);
    showToast(`已从待排候选池中移除全部 ${count} 部作品`);
  };

  const handleCycleTierRowStyle = () => {
    const order: TierRowStyle[] = [
      'ambient-glass',
      'minimal-blur',
      'floating-split',
      'pure-transparent',
    ];
    const names: Record<TierRowStyle, string> = {
      'ambient-glass': '动态弥散光毛玻璃 (无白边)',
      'minimal-blur': '极简无框柔雾',
      'floating-split': '左环独立 · 右侧透明',
      'pure-transparent': '全透明无底板',
    };
    const next = order[(order.indexOf(tierRowStyle) + 1) % order.length];
    setTierRowStyle(next);
    showToast(`已切换档位样式：${names[next]}`);
  };

  const handleUpdateAnimeMetadata = (updated: AnimeItem) => {
    setTiers(prev => {
      const next = normalizeTierMap(prev);
      for (const key of Object.keys(next)) {
        next[key] = next[key].map(item => (item.id === updated.id ? { ...item, ...updated } : item));
      }
      return next;
    });
    setUnrankedPool(prev =>
      prev.map(item => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
  };

  const handleSaveComment = (payload: Omit<CommentItem, 'id' | 'updatedAt'>) => {
    setComments(prev => {
      const existingIdx = prev.findIndex(c => c.animeId === payload.animeId);
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          ...payload,
          updatedAt: Date.now(),
        };
        return updated;
      }
      return [
        {
          ...payload,
          id: `c-${Date.now()}`,
          updatedAt: Date.now(),
        },
        ...prev,
      ];
    });
    showToast(`已保存《${payload.animeTitle}》的短评`);
  };

  const handleCycleCardStyle = (commentId: string) => {
    setComments(prev =>
      prev.map(c => {
        if (c.id !== commentId) return c;
        const nextStyle = (((c.cardStyle % 6) + 1) as CommentCardStyle);
        return { ...c, cardStyle: nextStyle };
      }),
    );
  };

  const handleShuffleAllCommentStyles = () => {
    const styles: CommentCardStyle[] = [1, 2, 3, 4, 5, 6];
    setComments(prev =>
      prev.map((c, idx) => {
        const candidates = styles.filter(s => s !== c.cardStyle);
        const pick = candidates[(idx + Math.floor(Math.random() * candidates.length)) % candidates.length];
        return { ...c, cardStyle: pick };
      }),
    );
    showToast('已随机混排全部漫评卡片的羽化渐变样式');
  };

  const handleDeleteComment = (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    showToast('已删除短评');
  };

  const exportCategoryCounts = useMemo(() => {
    let animeCount = 0;
    let bookCount = 0;
    let gameCount = 0;
    const safeTiers = normalizeTierMap(tiers);
    for (const score of ALL_TIER_SCORES) {
      const items = safeTiers[String(score)] || [];
      for (const item of items) {
        if (item.category === 'book') bookCount++;
        else if (item.category === 'game') gameCount++;
        else animeCount++;
      }
    }
    return {
      anime: animeCount,
      book: bookCount,
      game: gameCount,
      total: stats.totalAnime,
      avg: stats.averageScore > 0 ? stats.averageScore.toFixed(2) : '0.00',
    };
  }, [tiers, stats]);

  const handleExportImage = async () => {
    if (!boardRef.current || isExportingImage) return;
    setIsExportingImage(true);
    showToast('正在生成榜单长图...');

    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 140));

      const dataUrl = await toPng(boardRef.current, {
        quality: 0.96,
        pixelRatio: 2,
        backgroundColor: '#090a10',
        cacheBust: true,
      });

      const link = document.createElement('a');
      link.download = `${(boardTitle || 'bgm-anitier').replace(/[\\/:*?"<>|]/g, '_')}-tierlist.png`;
      link.href = dataUrl;
      link.click();
      showToast('已导出 Tier List 榜单长图');
    } catch {
      showToast('导出图片失败，部分外链图片可能受跨域限制');
    } finally {
      setIsExportingImage(false);
    }
  };

  const handleExportJson = (includeCredentials = false) => {
    if (isExportingBackup) return;
    setIsExportingBackup(true);
    try {
      const snapshot = createBackup(appStorage.snapshot(), { includeCredentials });
      downloadBackup(snapshot, (boardTitle || 'bgm-anitier') + '-backup.json');
      showToast(
        includeCredentials
          ? '备份已导出（含 API Key 与 Bangumi Token，请妥善保管）'
          : '脱敏备份已导出（已自动剔除个人密钥，可安全分享）',
      );
    } catch {
      showToast('导出失败，请重试；当前数据保留');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleImportJsonFile = async (file: File) => {
    if (isImportingBackup) return;
    setIsImportingBackup(true);
    try {
      const patch = parseBackup(JSON.parse(await file.text()));
      await flushStorage();
      await importStorage(patch);
      // All components initialize together from the committed snapshot.
      window.location.reload();
    } catch (error) {
      setIsImportingBackup(false);
      showToast(error instanceof Error ? error.message : '导入失败，当前数据未修改');
    }
  };

  const handleResetToDefault = () => {
    // 1. Reset board, unranked pool, comments, and reports
    setTiers(createEmptyTierMap());
    setUnrankedPool([]);
    setComments([]);
    setSavedReport('');
    setHighlightedTag(null);

    // 2. Reset styles and appearance to defaults
    setGradingSystem('numeric');
    setVisibleTiers([...DEFAULT_VISIBLE_TIERS]);
    setExportHideEmptyTiers(true);
    setShowTitles(true);
    setActiveThemeId(getInitialThemeId(null, null));
    setTierRowStyle('ambient-glass');
    setTierRowOpacity(82);
    setCustomBgUrl('');
    setUseCustomBg(false);
    setEnableParticles(false);
    setEnableGlow(true);
    setEnableGlassBlur(true);
    setGlassBlurPx(10);

    // 3. Reset WorldBooks, personas, and prompts to defaults (keep apiKey and bgm token untouched)
    const nextAiConfig: AIConfig = {
      ...aiConfig,
      worldBookEntries: DEFAULT_WORLD_BOOK_ENTRIES.map(e => ({ ...e })),
      personas: DEFAULT_PERSONAS.map(p => ({ ...p })),
      d0Prompt: '',
    };
    setAiConfig(nextAiConfig);

    try {
      appStorage.setItem(STORAGE_KEYS.TIERS, JSON.stringify(createEmptyTierMap()));
      appStorage.setItem(STORAGE_KEYS.UNRANKED_POOL, JSON.stringify([]));
      appStorage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify([]));
      appStorage.setItem(STORAGE_KEYS.TASTE_REPORT, '');
      appStorage.setItem(STORAGE_KEYS.REPORT_CHAT, JSON.stringify([]));
      appStorage.setItem(STORAGE_KEYS.GRADING_SYSTEM, 'numeric');
      appStorage.setItem(STORAGE_KEYS.VISIBLE_TIERS, JSON.stringify(DEFAULT_VISIBLE_TIERS));
      appStorage.setItem(STORAGE_KEYS.EXPORT_HIDE_EMPTY, 'true');
      appStorage.setItem(STORAGE_KEYS.SHOW_TITLES, 'true');
      appStorage.setItem(STORAGE_KEYS.THEME, getInitialThemeId(null, null));
      appStorage.setItem(STORAGE_KEYS.TIER_ROW_STYLE, 'ambient-glass');
      appStorage.setItem(STORAGE_KEYS.TIER_ROW_OPACITY, '82');
      appStorage.setItem(STORAGE_KEYS.CUSTOM_BG, '');
      appStorage.setItem(STORAGE_KEYS.USE_CUSTOM_BG, 'false');
      appStorage.setItem(STORAGE_KEYS.PARTICLES, 'false');
      appStorage.setItem(STORAGE_KEYS.GLOW, 'true');
      appStorage.setItem(STORAGE_KEYS.GLASS_BLUR, 'true');
      appStorage.setItem(STORAGE_KEYS.GLASS_BLUR_PX, '10');
      appStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(nextAiConfig));
      appStorage.setItem(STUDIO_STORAGE_KEYS.SCRIPT, JSON.stringify([]));
      appStorage.setItem(
        STUDIO_STORAGE_KEYS.PROMPT_RULES,
        JSON.stringify(DEFAULT_STUDIO_PROMPT_RULES_CONFIG),
      );
      appStorage.setItem(
        STUDIO_STORAGE_KEYS.COMPANIONS,
        JSON.stringify(DEFAULT_STUDIO_AI_COMPANIONS),
      );
    } catch {
      // ignore
    }
    setSettingsState(prev => ({ ...prev, isOpen: false }));
    showToast('已恢复默认设置（API 密钥与 Bangumi 凭证已保留）');
  };

  const activeTheme = getThemeById(activeThemeId);

  return (
    <div className="relative min-h-screen flex flex-col text-white">
      {isImportingBackup && <div role="status" className="fixed inset-0 z-[200] grid place-items-center bg-zinc-950/90 text-sm">正在校验并保存备份，完成后会重新打开页面…</div>}
      {/* Dedicated Next-Gen Background Engine: HTML5 Canvas Fluid Aurora Mesh + Apple Music Live Cover Chameleon Projection + Micro-Grid + Film Grain */}
      <AmbientBackgroundCanvas
        theme={activeTheme}
        tiers={tiers}
        unrankedPool={unrankedPool}
        enableGlow={enableGlow}
        useCustomBg={useCustomBg}
        customBgUrl={customBgUrl}
      />

      {/* Optional Custom Background Frosted Blur Layer */}
      {useCustomBg && customBgUrl && enableGlassBlur && glassBlurPx > 0 && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            backdropFilter: `blur(${glassBlurPx}px)`,
            WebkitBackdropFilter: `blur(${glassBlurPx}px)`,
          }}
        />
      )}

      {/* Optional Ambient Floating Particles Effect */}
      {enableParticles && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          {[
            { top: '12%', left: '15%', size: 6, delay: '0s' },
            { top: '28%', left: '82%', size: 8, delay: '1.2s' },
            { top: '54%', left: '10%', size: 5, delay: '2.5s' },
            { top: '68%', left: '88%', size: 7, delay: '0.8s' },
            { top: '85%', left: '25%', size: 6, delay: '3.1s' },
          ].map((p, idx) => (
            <span
              key={idx}
              className="ambient-particle"
              style={{
                top: p.top,
                left: p.left,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDelay: p.delay,
              }}
            />
          ))}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-white/20 text-xs font-medium text-white shadow-2xl backdrop-blur-md"
        >
          {toastMessage}
        </div>
      )}

      {isRecordingMode ? (
        <RecordingStudioPage
          boardTitle={boardTitle}
          tiers={tiers}
          unrankedPool={unrankedPool}
          comments={comments}
          visibleTiers={visibleTiers}
          gradingSystem={gradingSystem}
          tierRowStyle={tierRowStyle}
          tierRowOpacity={tierRowOpacity}
          showTitles={showTitles}
          aiConfig={aiConfig}
          onAiConfigChange={setAiConfig}
          onUpdateTiers={nextTiers => setTiers(current => mergeTierMetadata(current, nextTiers))}
          onExitStudio={() => setIsRecordingMode(false)}
        />
      ) : (
        <>
          {/* Centered Hero Title & Floating Controls */}
          <HeaderBar
            boardTitle={boardTitle}
            onUpdateTitle={setBoardTitle}
            stats={stats}
            poolCount={unrankedPool.length}
            isPoolOpen={isPoolOpen}
            onTogglePool={() => setIsPoolOpen(prev => !prev)}
            isRecordingMode={isRecordingMode}
            onToggleRecordingMode={() => {
              setIsRecordingMode(true);
            }}
            gradingSystem={gradingSystem}
            onToggleGradingSystem={handleToggleGradingSystem}
            showHalfTiers={hasAllHalfTiersVisible}
            onToggleAllHalfTiers={handleToggleAllHalfTiers}
            tierRowStyle={tierRowStyle}
            onCycleTierRowStyle={handleCycleTierRowStyle}
            onOpenSearch={() => setSearchModalState({ isOpen: true, targetScore: 'pool' })}
            onOpenBgmSync={() => {
              setBgmSyncModalTab('pull');
              setIsBgmSyncModalOpen(true);
            }}
            onOpenBgmPush={() => {
              setBgmSyncModalTab('push');
              setIsBgmSyncModalOpen(true);
            }}
            onOpenPosterWall={() => setIsPosterWallModalOpen(true)}
            onOpenSettings={() => setSettingsState({ isOpen: true, tab: 'themes' })}
            onExportImage={handleExportImage}
            isExportingImage={isExportingImage}
            exportHideEmptyTiers={exportHideEmptyTiers}
            onToggleExportHideEmptyTiers={() => {
              setExportHideEmptyTiers(prev => {
                const next = !prev;
                showToast(
                  next
                    ? '截图设置：导出长图时仅保留有作品的 Tier 行'
                    : '截图设置：导出长图时保留全部 Tier 行（含空行）',
                );
                return next;
              });
            }}
          />

          {/* Main Content Container */}
          <main className="relative z-10 flex-1 w-full max-w-[1520px] mx-auto px-5 sm:px-8 pb-16 space-y-14">
        {/* Tier List Board + Sticky Side Unranked Candidate Pool */}
        <div
          className={`flex flex-col lg:flex-row items-start gap-6 ${
            poolDockSide === 'left' ? 'lg:flex-row-reverse' : ''
          }`}
        >
          {/* Tier List Board */}
          <section
            id="board"
            ref={boardRef}
            className={`flex-1 w-full min-w-0 space-y-5 ${
              isExportingImage
                ? 'p-7 sm:p-9 rounded-[28px] bg-[#090a10] relative isolate overflow-hidden shadow-2xl'
                : ''
            }`}
            style={
              isExportingImage
                ? {
                    backgroundImage:
                      useCustomBg && customBgUrl
                        ? `linear-gradient(180deg, rgba(9,10,16,0.72) 0%, rgba(9,10,16,0.88) 100%), url(${customBgUrl})`
                        : activeTheme.backgroundCss,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            {isExportingImage && (
              <div
                data-testid="tierlist-export-header"
                className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 mb-2 border-b border-white/[0.08]"
              >
                <div>
                  <div className="flex items-center gap-2 text-[10.5px] font-mono tracking-[0.2em] uppercase text-white/45 mb-2">
                    <span>BGM ANITIER · TIER LIST VISUAL ARCHIVE</span>
                    <span>·</span>
                    <span>CURATED BY {bgmSyncConfig.nickname || 'ANITIER'}</span>
                  </div>
                  <h1 className="text-2xl sm:text-[34px] font-black tracking-tight text-white leading-none">
                    {boardTitle}
                  </h1>
                </div>

                {/* Exact Unified Monochrome Glass Stat Capsule matching PosterWallModal */}
                <div className="inline-flex flex-wrap items-center gap-1 p-1.5 rounded-2xl bg-white/[0.05] self-start md:self-auto">
                  <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-white/85">
                    <Tv className="w-3.5 h-3.5 text-white/65" />
                    <span className="text-xs text-white/55">动画</span>
                    <span className="text-sm font-extrabold text-white tabular-nums">
                      {exportCategoryCounts.anime}
                    </span>
                  </div>

                  <div className="w-[1px] h-4 bg-white/[0.08]" />

                  <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-white/85">
                    <BookOpen className="w-3.5 h-3.5 text-white/65" />
                    <span className="text-xs text-white/55">书籍</span>
                    <span className="text-sm font-extrabold text-white tabular-nums">
                      {exportCategoryCounts.book}
                    </span>
                  </div>

                  <div className="w-[1px] h-4 bg-white/[0.08]" />

                  <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-white/85">
                    <Gamepad2 className="w-3.5 h-3.5 text-white/65" />
                    <span className="text-xs text-white/55">游戏</span>
                    <span className="text-sm font-extrabold text-white tabular-nums">
                      {exportCategoryCounts.game}
                    </span>
                  </div>

                  <div className="px-3.5 py-1.5 rounded-xl bg-white text-zinc-950 flex items-center gap-2 ml-1 shadow-sm">
                    <span className="text-xs font-extrabold tabular-nums">
                      TOTAL {exportCategoryCounts.total}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-600">
                      AVG {exportCategoryCounts.avg}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {(isExportingImage && exportHideEmptyTiers
              ? visibleTiers.filter(score => (tiers[String(score)] || []).length > 0)
              : visibleTiers
            ).map(score => (
              <TierRow
                key={score}
                score={score}
                gradingSystem={gradingSystem}
                items={tiers[String(score)] || []}
                showTitles={showTitles}
                highlightedTag={highlightedTag}
                commentedAnimeIds={commentedAnimeIds}
                tierRowStyle={tierRowStyle}
                tierRowOpacity={tierRowOpacity}
                readOnlyStage={isExportingImage}
                onAddClick={targetScore =>
                  setSearchModalState({ isOpen: true, targetScore })
                }
                onSelectAnimeDetail={(anime, currentScore) =>
                  setDetailTarget({ anime, score: currentScore })
                }
                onOpenCommentModal={(anime, currentScore) =>
                  setCommentTarget({ anime, score: currentScore })
                }
                onRemoveAnime={handleRemoveAnime}
                onMoveAnime={handleMoveAnimeToTier}
                onReturnToPool={animeId => handleMoveAnimeIntoPool(animeId)}
              />
            ))}

            {isExportingImage && (
              <div
                data-testid="tierlist-export-footer"
                className="relative z-10 mt-6 pt-4 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-white/40 font-mono"
              >
                <span>BGM ANITIER · TIER LIST VISUAL ARCHIVE</span>
                <span>
                  {new Date().toISOString().slice(0, 10)} · {exportCategoryCounts.total} WORKS ARCHIVED
                </span>
              </div>
            )}
          </section>

          {/* Sticky Side Candidate Pool for Video Recording / Batch Image Drop / BGM Sync */}
          {isPoolOpen && (
            <UnrankedPoolSidebar
              pool={unrankedPool}
              dockSide={poolDockSide}
              onToggleDockSide={() =>
                setPoolDockSide(prev => (prev === 'right' ? 'left' : 'right'))
              }
              onCollapse={() => setIsPoolOpen(false)}
              onOpenSearchForPool={() =>
                setSearchModalState({ isOpen: true, targetScore: 'pool' })
              }
              onOpenBgmSync={() => setIsBgmSyncModalOpen(true)}
              onBatchUploadImages={handleBatchUploadImagesToPool}
              onMoveAllBoardToPool={handleMoveAllBoardToPool}
              onClearPool={handleClearPool}
              onDropAnimeIntoPool={handleMoveAnimeIntoPool}
              onRemoveFromPool={handleRemoveAnime}
              onQuickAssignScore={(anime, score) => handleMoveAnimeToTier(anime.id, score)}
              onSelectAnimeDetail={anime => setDetailTarget({ anime, score: 'pool' })}
              onRenameAnimeTitle={handleRenameAnimeTitle}
            />
          )}
        </div>

        {!isRecordingMode && (
          <>
            {/* Tag Analysis Section */}
            <TagAnalysisSection
              tiers={tiers}
              highlightedTag={highlightedTag}
              onSelectTag={setHighlightedTag}
              onUpdateAnimeMetadata={handleUpdateAnimeMetadata}
            />

            {/* Editorial Feathered Masonry Waterfall Reviews Section */}
            <CommentsSection
              comments={comments}
              gradingSystem={gradingSystem}
              editingTarget={commentTarget}
              onCloseModal={() => setCommentTarget(null)}
              onSaveComment={handleSaveComment}
              onDeleteComment={handleDeleteComment}
              onCycleCardStyle={handleCycleCardStyle}
              onShuffleAllStyles={handleShuffleAllCommentStyles}
              onEditExistingComment={comment => {
                const foundDest = existingAnimeTierMap.get(comment.animeId);
                const foundScore = (
                  typeof foundDest === 'number' ? foundDest : comment.tierScore || 10
                ) as TierScore;
                setCommentTarget({
                  anime: {
                    id: comment.animeId,
                    title: comment.animeTitle,
                    cover: comment.animeCover,
                  },
                  score: foundScore,
                });
              }}
            />

            {/* AI Taste Report Section with Custom Personas & Ordered World Book */}
            <TasteReportSection
              tiers={tiers}
              comments={comments}
              gradingSystem={gradingSystem}
              savedReport={savedReport}
              onSaveReport={setSavedReport}
              externalAiConfig={aiConfig}
              onAiConfigChange={setAiConfig}
              autoEnrichStatus={autoEnrichStatus}
              onUpdateTiers={nextTiers => setTiers(current => mergeTierMetadata(current, nextTiers))}
              onAdoptComment={(anime, score, text) => {
                handleSaveComment({
                  animeId: anime.id,
                  animeTitle: anime.title,
                  animeCover: anime.cover,
                  tierScore: score as TierScore,
                  text,
                  cardStyle: 1,
                });
                showToast(`已将《${anime.title}》的 AI 锐评金句采纳进个人简评`);
              }}
            />
            {/* Project Footer with GitHub Link */}
            <footer
              data-testid="project-github-footer"
              className="pt-6 pb-2 border-t border-white/[0.07] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/45"
            >
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold text-white/70">BGM AniTier</span>
                <span>·</span>
                <span>个人动画 / 书籍 / 游戏鉴赏排榜与 AI 毒舌锐评小剧场</span>
              </div>
              <a
                href="https://github.com/ikemenrourou/BGM-AniTier"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="project-github-link"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.1] text-white/80 hover:text-white font-mono text-xs transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                <span>BGM-AniTier · GitHub</span>
              </a>
            </footer>
          </>
        )}
          </main>
        </>
      )}

      {/* Modals & Drawers */}
      <SearchModal
        isOpen={searchModalState.isOpen}
        initialTargetScore={searchModalState.targetScore}
        visibleTiers={visibleTiers}
        gradingSystem={gradingSystem}
        existingAnimeTierMap={existingAnimeTierMap}
        onClose={() => setSearchModalState(prev => ({ ...prev, isOpen: false }))}
        onAddAnime={handleAddAnime}
      />

      <BangumiSyncModal
        isOpen={isBgmSyncModalOpen}
        initialTab={bgmSyncModalTab}
        syncConfig={bgmSyncConfig}
        onUpdateSyncConfig={setBgmSyncConfig}
        existingIds={allExistingIds}
        tiers={tiers}
        comments={comments}
        gradingSystem={gradingSystem}
        onImportToPool={handleImportFromBangumiSync}
        onPushSuccess={showToast}
        onClose={() => setIsBgmSyncModalOpen(false)}
      />

      <PosterWallModal
        isOpen={isPosterWallModalOpen}
        boardTitle={boardTitle}
        tiers={tiers}
        gradingSystem={gradingSystem}
        unrankedPool={unrankedPool}
        comments={comments}
        bgmNickname={bgmSyncConfig.nickname}
        onClose={() => setIsPosterWallModalOpen(false)}
      />

      <AnimeDetailModal
        anime={detailTarget?.anime || null}
        currentScore={detailTarget?.score || null}
        visibleTiers={visibleTiers}
        gradingSystem={gradingSystem}
        bgmToken={bgmSyncConfig.token}
        userCommentText={
          detailTarget?.anime
            ? comments.find(
                c =>
                  c.animeId === detailTarget.anime.id &&
                  !String(c.id || '').startsWith('demo-c-'),
              )?.text
            : undefined
        }
        onSyncSuccess={showToast}
        onClose={() => setDetailTarget(null)}
        onChangeDestination={(animeId, dest) => {
          if (dest === 'pool') {
            handleMoveAnimeIntoPool(animeId);
          } else {
            handleMoveAnimeToTier(animeId, dest);
          }
        }}
        onOpenComment={(anime, score) => setCommentTarget({ anime, score })}
        onRemoveAnime={handleRemoveAnime}
        onUpdateAnimeMetadata={handleUpdateAnimeMetadata}
      />

      <SettingsDrawer
        isOpen={settingsState.isOpen}
        activeTab={settingsState.tab}
        onTabChange={tab => setSettingsState(prev => ({ ...prev, tab }))}
        onClose={() => setSettingsState(prev => ({ ...prev, isOpen: false }))}
        gradingSystem={gradingSystem}
        onChangeGradingSystem={handleChangeGradingSystem}
        exportHideEmptyTiers={exportHideEmptyTiers}
        onToggleExportHideEmptyTiers={setExportHideEmptyTiers}
        showTitles={showTitles}
        onToggleShowTitles={setShowTitles}
        visibleTiers={visibleTiers}
        onToggleTierVisibility={handleToggleSingleTierVisibility}
        tierRowStyle={tierRowStyle}
        onChangeTierRowStyle={setTierRowStyle}
        tierRowOpacity={tierRowOpacity}
        onChangeTierRowOpacity={setTierRowOpacity}
        activeThemeId={activeThemeId}
        onSelectTheme={setActiveThemeId}
        customBgUrl={customBgUrl}
        onChangeCustomBgUrl={setCustomBgUrl}
        useCustomBg={useCustomBg}
        onToggleUseCustomBg={setUseCustomBg}
        enableParticles={enableParticles}
        onToggleParticles={setEnableParticles}
        enableGlow={enableGlow}
        onToggleGlow={setEnableGlow}
        enableGlassBlur={enableGlassBlur}
        onToggleGlassBlur={setEnableGlassBlur}
        glassBlurPx={glassBlurPx}
        onChangeGlassBlurPx={setGlassBlurPx}
        onExportJson={handleExportJson}
        isExportingBackup={isExportingBackup}
        onImportJsonFile={handleImportJsonFile}
        onResetToDefault={handleResetToDefault}
      />
    </div>
  );
}

export default App;
