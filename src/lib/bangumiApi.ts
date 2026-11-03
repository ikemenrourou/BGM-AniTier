import { fetchAppApi, IS_STATIC_HOSTING } from './runtime';
import { appStorage } from './appStorage';
import { DEEP_DATA_VERSION, fetchBangumiSubjectDetails } from './bangumiDeepData';
import type { AnimeItem, SubjectCategory, TierMap } from '../types';
import { normalizeTierMap } from './tierLogic';
import { createSeasonalSubjectPager, fetchSeasonalSubjects } from './bangumiSeasonal';

export const DEFAULT_USER_BGM_TOKEN = ''; 

function mapSubjectTypeToCategory(typeNum?: number): SubjectCategory {
  if (typeNum === 1) return 'book';
  if (typeNum === 4) return 'game';
  return 'anime';
}

function getClientBgmToken(explicitToken?: string): string {
  if (explicitToken && explicitToken.trim()) return explicitToken.trim();
  if (typeof window !== 'undefined') {
    try {
      const raw =
        appStorage.getItem('anime-tier-list-bgm-sync-v5') ||
        appStorage.getItem('bgm-anitier:bgm-sync:v5');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.token && typeof parsed.token === 'string' && parsed.token.trim()) {
          return parsed.token.trim();
        }
      }
    } catch {
      // ignore storage read error
    }
  }
  return DEFAULT_USER_BGM_TOKEN;
}

function toCorsSafeCoverUrl(subjectId: number, directImg: string, useStaticFallback = false): string {
  if (useStaticFallback || IS_STATIC_HOSTING) {
    if (directImg) {
      return `https://wsrv.nl/?url=${encodeURIComponent(directImg)}`;
    }
    if (subjectId > 0) {
      return `https://api.bgm.tv/v0/subjects/${subjectId}/image?type=common`;
    }
    return '';
  }
  if (subjectId > 0) {
    return directImg
      ? `/api/bangumi/cover/${subjectId}?img=${encodeURIComponent(directImg)}`
      : `/api/bangumi/cover/${subjectId}`;
  }
  return directImg;
}

function readInfoboxEntryValue(entry: any): string {
  const rawVal = entry?.value;
  if (typeof rawVal === 'string' && rawVal.trim()) {
    return rawVal.trim();
  }
  if (Array.isArray(rawVal)) {
    const joined = rawVal
      .map((v: any) => (typeof v === 'string' ? v : v?.v || ''))
      .filter(Boolean)
      .join(' / ');
    if (joined.trim()) return joined.trim();
  }
  return '';
}

function extractInfoboxField(infobox: any[], candidateKeys: string[]): string {
  if (!Array.isArray(infobox)) return '';
  // Pass 1: Exact key match (`k === keyName`) so `动画制作` never accidentally matches `ED动画制作` or `制作协力`
  for (const keyName of candidateKeys) {
    for (const entry of infobox) {
      const k = String(entry?.key || '').trim();
      if (k === keyName) {
        const val = readInfoboxEntryValue(entry);
        if (val) return val;
      }
    }
  }
  // Pass 2: Substring fallback excluding OP/ED/assistance/sound credits
  for (const keyName of candidateKeys) {
    for (const entry of infobox) {
      const k = String(entry?.key || '').trim();
      if (
        k.includes('ED') ||
        k.includes('OP') ||
        k.includes('协力') ||
        k.includes('協力') ||
        k.includes('音乐') ||
        k.includes('音楽') ||
        k.includes('音响')
      ) {
        continue;
      }
      if (k.includes(keyName)) {
        const val = readInfoboxEntryValue(entry);
        if (val) return val;
      }
    }
  }
  return '';
}

function mapBangumiSubjectToAnime(item: any, useStaticFallback = false): AnimeItem {
  const tags: string[] = Array.isArray(item.tags)
    ? item.tags
        .map((t: any) => (typeof t === 'string' ? t : t?.name))
        .filter((n: any): n is string => typeof n === 'string' && n.length > 0)
        .slice(0, 12)
    : [];

  const tagsWithCount: Array<{ name: string; count: number }> = Array.isArray(item.tags)
    ? item.tags
        .filter((t: any) => typeof t?.name === 'string' && t.name.trim())
        .map((t: any) => ({
          name: String(t.name).trim(),
          count: typeof t.count === 'number' ? t.count : 0,
        }))
        .slice(0, 10)
    : [];

  const category = mapSubjectTypeToCategory(item.type);
  const infobox = Array.isArray(item.infobox) ? item.infobox : [];

  const studio = extractInfoboxField(infobox, ['动画制作', '制作', '开发', '开发商', '出版社']);
  const director = extractInfoboxField(infobox, ['导演', '监督', '总导演', '总监督']);
  const scriptWriter = extractInfoboxField(infobox, ['系列构成', '脚本', '剧本', '剧本原案']);
  const originalWork = extractInfoboxField(infobox, ['原作']);
  const author = extractInfoboxField(infobox, ['作者', '原作']);
  const illustrator = extractInfoboxField(infobox, ['插图', '插画', '作画', '人物原案', '原画', '人物设定']);
  const publisher = extractInfoboxField(infobox, ['出版社', '连载杂志', '文库', '发行', '开发']);

  const subjectId = Number(item.id);
  const directImg = item.images?.common || item.images?.large || item.images?.medium || '';
  const coverUrl = toCorsSafeCoverUrl(subjectId, directImg, useStaticFallback);

  const collectionStats =
    item.collection && typeof item.collection === 'object'
      ? {
          wish: typeof item.collection.wish === 'number' ? item.collection.wish : undefined,
          collect: typeof item.collection.collect === 'number' ? item.collection.collect : undefined,
          doing: typeof item.collection.doing === 'number' ? item.collection.doing : undefined,
          on_hold: typeof item.collection.on_hold === 'number' ? item.collection.on_hold : undefined,
          dropped: typeof item.collection.dropped === 'number' ? item.collection.dropped : undefined,
        }
      : undefined;

  const ratingTotal =
    typeof item.rating?.total === 'number' ? item.rating.total : undefined;
  const ratingCounts =
    item.rating?.count && typeof item.rating.count === 'object'
      ? (item.rating.count as Record<string, number>)
      : undefined;

  return {
    id: subjectId,
    title: item.name_cn || item.name || `条目 #${subjectId}`,
    originalTitle: item.name || undefined,
    cover: coverUrl,
    airDate: item.date || item.air_date || undefined,
    bgmScore:
      typeof item.rating?.score === 'number'
        ? item.rating.score
        : typeof item.score === 'number'
          ? item.score
          : undefined,
    bgmRank:
      typeof item.rating?.rank === 'number'
        ? item.rating.rank
        : typeof item.rank === 'number'
          ? item.rank
          : undefined,
    eps:
      typeof item.eps === 'number' && item.eps > 0
        ? item.eps
        : typeof item.total_episodes === 'number'
          ? item.total_episodes
          : undefined,
    volumes: typeof item.volumes === 'number' && item.volumes > 0 ? item.volumes : undefined,
    summary: item.summary || item.short_summary || undefined,
    studio: studio || undefined,
    director: director || undefined,
    scriptWriter: scriptWriter || undefined,
    originalWork: originalWork || undefined,
    author: author || undefined,
    illustrator: illustrator || undefined,
    publisher: publisher || undefined,
    platform: typeof item.platform === 'string' && item.platform ? item.platform : undefined,
    collectionStats,
    ratingTotal,
    ratingCounts,
    category,
    tags,
    tagsWithCount: tagsWithCount.length > 0 ? tagsWithCount : undefined,
  };
}

export function createBangumiSeasonalSearch(year: number, month: number, signal: AbortSignal) {
  const token = getClientBgmToken();
  const pager = createSeasonalSubjectPager({ year, month, signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  return {
    loadMore: async () => {
      const page = await pager.loadMore();
      return { data: page.data.map(item => mapBangumiSubjectToAnime(item, true)), hasMore: page.hasMore };
    },
  };
}

export async function searchBangumiAnime(options: {
  keyword?: string;
  tag?: string;
  subjectType?: number | number[];
  limit?: number;
  offset?: number;
  seasonalYear?: number;
  seasonalMonth?: number;
  signal?: AbortSignal;
  onProgress?: (loaded: number) => void;
}): Promise<{ data: AnimeItem[]; total: number }> {
  const {
    keyword = '',
    tag = '',
    subjectType = 2,
    limit = 50,
    offset = 0,
    seasonalYear,
    seasonalMonth,
    signal,
    onProgress,
  } = options;

  if (seasonalYear && seasonalMonth) {
    const token = getClientBgmToken();
    const result = await fetchSeasonalSubjects({
      year: seasonalYear,
      month: seasonalMonth,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal,
      onProgress,
    });
    return { data: result.data.map(item => mapBangumiSubjectToAnime(item, true)), total: result.total };
  }

  // 1. Try server/Edge proxy (/api/bangumi/search) first
  try {
    const response = await fetchAppApi('/api/bangumi/search', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword,
        tag,
        subjectType,
        limit,
        offset,
        seasonalYear,
        seasonalMonth,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        return {
          data: json.data.map((item: any) => mapBangumiSubjectToAnime(item, false)),
          total: json.total || json.data.length,
        };
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Proceed to direct Bangumi v0 browser fallback
  }

  // 2. Direct browser fallback to https://api.bgm.tv/v0/search/subjects (for static Cloudflare Pages / web hosting)
  try {
    const typeFilter = Array.isArray(subjectType)
      ? subjectType.map(Number).filter(n => [1, 2, 4].includes(n))
      : [Number(subjectType) || 2];

    const filterObj: Record<string, any> = {
      type: typeFilter.length > 0 ? typeFilter : [2],
      nsfw: true,
    };

    if (tag) {
      filterObj.tag = [String(tag)];
    }

    const token = getClientBgmToken();
    const directRes = await fetch(
      `https://api.bgm.tv/v0/search/subjects?limit=${Math.min(Number(limit) || 50, 50)}&offset=${Number(offset) || 0}`,
      {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          keyword: keyword ? String(keyword) : '',
          sort: keyword ? 'match' : 'heat',
          filter: filterObj,
        }),
      },
    );

    if (directRes.ok) {
      const json = await directRes.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        return {
          data: json.data.map((item: any) => mapBangumiSubjectToAnime(item, true)),
          total: json.total || json.data.length,
        };
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn('Direct Bangumi search fallback failed:', err);
  }

  return { data: [], total: 0 };
}

export async function fetchBangumiSubjectDetail(subjectId: number): Promise<AnimeItem | null> {

  try {
    const response = await fetchAppApi(`/api/bangumi/subject/${subjectId}`);
    if (response.ok) {
      const json = await response.json();
      if (json && json.id) {
        return mapBangumiSubjectToAnime(json, false);
      }
    }
  } catch {
    // Fallback to direct Bangumi API
  }

  try {
    const token = getClientBgmToken();
    const directRes = await fetch(`https://api.bgm.tv/v0/subjects/${subjectId}`, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (directRes.ok) {
      const json = await directRes.json();
      if (json && json.id) {
        return mapBangumiSubjectToAnime(json, true);
      }
    }
  } catch (err) {
    console.warn('Bangumi detail fetch fallback:', err);
  }

  return null;
}

export async function fetchBangumiUserCollections(options: {
  token: string;
  username?: string;
  subjectTypes?: number[]; // 2=动画, 1=书籍, 4=游戏
  collectionTypes?: number[]; // 3=在看, 2=看过, 1=想看, 4=搁置, 5=抛弃
  limit?: number;
  limitPerQuery?: number;
  daysLimit?: number; // >0 = only entries updated within the last N days
}): Promise<{
  user: { username: string; nickname: string; avatar?: string };
  data: AnimeItem[];
  items: AnimeItem[];
  totalBeforeDateFilter: number;
}> {
  // 1. Try server / Cloudflare Pages Function route first
  try {
    const response = await fetchAppApi('/api/bangumi/me-collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...options,
        limitPerQuery: options.limit || options.limitPerQuery || 36,
        daysLimit: options.daysLimit ?? 0,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      const items: AnimeItem[] = Array.isArray(json.data)
        ? json.data
            .map((entry: any) => {
              const sub = entry.subject || {};
              const subjectId = Number(entry.subject_id || sub.id);
              if (!subjectId) return null;
              const mapped = mapBangumiSubjectToAnime(
                {
                  ...sub,
                  id: subjectId,
                  type: entry.subject_type || sub.type || 2,
                },
                false,
              );
              return {
                ...mapped,
                userBgmRate: typeof entry.rate === 'number' && entry.rate > 0 ? entry.rate : undefined,
                userBgmComment:
                  typeof entry.comment === 'string' && entry.comment.trim()
                    ? entry.comment.trim()
                    : undefined,
                bgmUpdatedAt: entry.updated_at || undefined,
              } as AnimeItem;
            })
            .filter((x: AnimeItem | null): x is AnimeItem => x !== null)
        : [];

      return {
        user: json.user || { username: options.username || '', nickname: options.username || 'Bangumi 用户' },
        data: items,
        items,
        totalBeforeDateFilter:
          typeof json.totalBeforeDateFilter === 'number' ? json.totalBeforeDateFilter : items.length,
      };
    }
  } catch {
    // Proceed to direct browser fetch fallback for static web / CF Pages
  }

  // 2. Direct browser fallback to https://api.bgm.tv/v0/me & /v0/users/{username}/collections
  const cleanToken = getClientBgmToken(options.token);
  const authHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {}),
  };

  let resolvedUsername = (options.username || '').trim();
  let nickname = resolvedUsername;
  let avatar = '';

  if (resolvedUsername) {
    const uRes = await fetch(`https://api.bgm.tv/v0/users/${encodeURIComponent(resolvedUsername)}`, {
      headers: authHeaders,
    }).catch(() => null);
    if (uRes && uRes.ok) {
      const uData = await uRes.json();
      resolvedUsername = String(uData.username || uData.id || resolvedUsername);
      nickname = String(uData.nickname || resolvedUsername);
      avatar = uData.avatar?.large || uData.avatar?.medium || '';
    }
  } else if (cleanToken) {
    const meRes = await fetch('https://api.bgm.tv/v0/me', { headers: authHeaders });
    if (meRes.ok) {
      const meData = await meRes.json();
      resolvedUsername = String(meData.username || meData.id || resolvedUsername);
      nickname = String(meData.nickname || resolvedUsername);
      avatar = meData.avatar?.large || meData.avatar?.medium || '';
    } else if (!resolvedUsername) {
      throw new Error(`Bangumi Token 验证失败 (${meRes.status})，请检查 Token 或填写用户名`);
    }
  }

  if (!resolvedUsername) {
    throw new Error('请提供有效的 Bangumi Access Token 或用户名');
  }

  const sTypes =
    Array.isArray(options.subjectTypes) && options.subjectTypes.length > 0
      ? options.subjectTypes
      : [2];
  const cTypes =
    Array.isArray(options.collectionTypes) && options.collectionTypes.length > 0
      ? options.collectionTypes
      : [3, 2];
  const perQuery = Math.min(Math.max(Number(options.limit || options.limitPerQuery) || 50, 10), 50);

  const tasks: Promise<any[]>[] = [];
  for (const st of sTypes) {
    for (const ct of cTypes) {
      const url = `https://api.bgm.tv/v0/users/${encodeURIComponent(
        resolvedUsername,
      )}/collections?subject_type=${Number(st)}&type=${Number(ct)}&limit=${perQuery}&offset=0`;
      tasks.push(
        fetch(url, { headers: authHeaders })
          .then(async r => {
            if (!r.ok) return [];
            const d = await r.json();
            return Array.isArray(d.data)
              ? d.data.map((item: any) => ({
                  ...item,
                  subject_type: Number(st),
                  collection_type: Number(ct),
                }))
              : [];
          })
          .catch(() => []),
      );
    }
  }

  const results = await Promise.all(tasks);
  let merged = results.flat();
  const totalBeforeDateFilter = merged.length;

  const days = Number(options.daysLimit);
  if (days > 0) {
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    merged = merged.filter((entry: any) => {
      if (!entry.updated_at) return true;
      const updatedMs = Date.parse(entry.updated_at);
      return Number.isNaN(updatedMs) ? true : updatedMs >= cutoffMs;
    });
  }

  const items: AnimeItem[] = merged
    .map((entry: any) => {
      const sub = entry.subject || {};
      const subjectId = Number(entry.subject_id || sub.id);
      if (!subjectId) return null;
      const mapped = mapBangumiSubjectToAnime(
        {
          ...sub,
          id: subjectId,
          type: entry.subject_type || sub.type || 2,
        },
        true,
      );
      return {
        ...mapped,
        userBgmRate: typeof entry.rate === 'number' && entry.rate > 0 ? entry.rate : undefined,
        userBgmComment:
          typeof entry.comment === 'string' && entry.comment.trim()
            ? entry.comment.trim()
            : undefined,
        bgmUpdatedAt: entry.updated_at || undefined,
      } as AnimeItem;
    })
    .filter((x: AnimeItem | null): x is AnimeItem => x !== null);

  return {
    user: { username: resolvedUsername, nickname, avatar },
    data: items,
    items,
    totalBeforeDateFilter,
  };
}

export type BangumiCollectionStatusType = 1 | 2 | 3 | 4 | 5;

export interface PushBangumiCollectionOptions {
  token?: string;
  subjectId: number;
  /** 1=想看/想玩/想读, 2=看过/玩过/读过, 3=在看/在玩/在读, 4=搁置, 5=抛弃 */
  type: BangumiCollectionStatusType;
  /** 1..10 integer score (optional; omit to keep existing score on Bangumi) */
  rate?: number;
  /** Short review / comment (optional; omit to keep existing comment on Bangumi) */
  comment?: string;
  isPrivate?: boolean;
}

/**
 * Updates / creates a user's collection entry on Bangumi (`POST /v0/users/-/collections/{subject_id}`).
 * Works via `/api/bangumi/push-collection` (Express / Cloudflare Pages Functions) with a direct browser fallback.
 */
export async function pushBangumiUserCollection(
  options: PushBangumiCollectionOptions,
): Promise<{ ok: boolean; subjectId: number; type: number; rate?: number }> {
  const sid = Number(options.subjectId);
  if (!sid || sid <= 0) {
    throw new Error('无效的 Bangumi 条目 ID');
  }

  const cleanToken = getClientBgmToken(options.token);
  if (!cleanToken) {
    throw new Error('请先填写具有写入权限的 Bangumi Access Token');
  }

  const normalizedType: BangumiCollectionStatusType = [1, 2, 3, 4, 5].includes(Number(options.type))
    ? (Number(options.type) as BangumiCollectionStatusType)
    : 2;

  const normalizedRate =
    typeof options.rate === 'number' && !Number.isNaN(options.rate) && options.rate >= 1 && options.rate <= 10
      ? Math.round(options.rate)
      : undefined;

  const normalizedComment =
    typeof options.comment === 'string' && options.comment.trim().length > 0
      ? options.comment.trim().slice(0, 380)
      : undefined;

  // 1. Try server / Cloudflare Pages Edge Function `/api/bangumi/push-collection`
  try {
    const res = await fetchAppApi('/api/bangumi/push-collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: cleanToken,
        subjectId: sid,
        type: normalizedType,
        rate: normalizedRate,
        comment: normalizedComment,
        isPrivate: Boolean(options.isPrivate),
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({ ok: true }));
      return {
        ok: true,
        subjectId: sid,
        type: data.type ?? normalizedType,
        rate: data.rate ?? normalizedRate,
      };
    }
    if (res.status === 401 || res.status === 403 || res.status === 400) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Bangumi 拒绝写入 (${res.status})，请检查 Token 权限`);
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes('拒绝') || err.message.includes('Token'))) {
      throw err;
    }
    // Proceed to direct browser fallback
  }

  // 2. Direct browser fallback to https://api.bgm.tv/v0/users/-/collections/{subject_id}
  const payload: Record<string, unknown> = {
    type: normalizedType,
    private: Boolean(options.isPrivate),
  };
  if (normalizedRate !== undefined) {
    payload.rate = normalizedRate;
  }
  if (normalizedComment !== undefined) {
    payload.comment = normalizedComment;
  }

  const directRes = await fetch(`https://api.bgm.tv/v0/users/-/collections/${sid}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${cleanToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!directRes.ok && directRes.status !== 202 && directRes.status !== 204) {
    const errText = await directRes.text().catch(() => '');
    throw new Error(
      `同步到 Bangumi 失败 (${directRes.status}): ${errText.slice(0, 120) || '请检查 Token 是否有效'}`,
    );
  }

  return {
    ok: true,
    subjectId: sid,
    type: normalizedType,
    rate: normalizedRate,
  };
}

/**
 * Strips file extension and cleans up filename to serve as default anime/book/game title.
 */
export function extractTitleFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '').replace(/_+/g, ' ');
  return withoutExt.trim() || '自定义条目';
}

/**
 * Compresses an uploaded image file via HTML5 canvas so batch-uploading 20+ images stays fast and lightweight.
 */
export function compressImageFileToDataUrl(
  file: File,
  maxWidth = 380,
  maxHeight = 540,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片文件失败'));
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a remote or proxied image URL to a self-contained Base64 Data URL for All-in-One offline backup.
 */
export async function convertImageUrlToDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  const tryFetchAsDataUrl = async (targetUrl: string): Promise<string | null> => {
    try {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      return await new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onloadend = () => {
          resolve(typeof reader.result === 'string' ? reader.result : null);
        };
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const direct = await tryFetchAsDataUrl(url);
  if (direct) return direct;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const proxied = await tryFetchAsDataUrl(`https://wsrv.nl/?url=${encodeURIComponent(url)}`);
    if (proxied) return proxied;
  }
  return url;
}

const DEEP_CACHE_STORAGE_KEY = 'bgm-anitier:deep-subject-cache:v5';
const LEGACY_DEEP_CACHE_KEY_V4 = 'bgm-anitier:deep-subject-cache:v4';
const LEGACY_DEEP_CACHE_KEY_V3 = 'bgm-anitier:deep-subject-cache:v3';
const LEGACY_DEEP_CACHE_KEY_V2 = 'bgm-anitier:deep-subject-cache:v2';
const memoryDeepCache = new Map<number, Partial<AnimeItem>>();

function readLocalDeepCache(includeLegacy = false): Record<string, Partial<AnimeItem>> {
  if (typeof window === 'undefined') return {};
  try {
    const rawV3 = window.localStorage.getItem(DEEP_CACHE_STORAGE_KEY);
    const parsedV3 = rawV3 ? JSON.parse(rawV3) : {};
    if (!includeLegacy) {
      return parsedV3 && typeof parsedV3 === 'object' ? parsedV3 : {};
    }
    const legacyV3 = JSON.parse(window.localStorage.getItem(LEGACY_DEEP_CACHE_KEY_V3) || '{}');
    const legacyV4 = JSON.parse(window.localStorage.getItem(LEGACY_DEEP_CACHE_KEY_V4) || '{}');
    const rawV2 = window.localStorage.getItem(LEGACY_DEEP_CACHE_KEY_V2);
    const parsedV2 = rawV2 ? JSON.parse(rawV2) : {};
    return {
      ...(parsedV2 && typeof parsedV2 === 'object' ? parsedV2 : {}),
      ...(legacyV3 && typeof legacyV3 === 'object' ? legacyV3 : {}),
      ...(legacyV4 && typeof legacyV4 === 'object' ? legacyV4 : {}),
      ...(parsedV3 && typeof parsedV3 === 'object' ? parsedV3 : {}),
    };
  } catch {
    return {};
  }
}

function writeLocalDeepCache(subjectId: number, patch: Partial<AnimeItem>) {
  memoryDeepCache.set(subjectId, patch);
  if (typeof window === 'undefined') return;
  try {
    const current = readLocalDeepCache();
    current[String(subjectId)] = patch;
    // Keep at most 180 cached subjects in localStorage to stay lightweight
    const keys = Object.keys(current);
    if (keys.length > 180) {
      delete current[keys[0]];
    }
    window.localStorage.setItem(DEEP_CACHE_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore quota error
  }
}

/**
 * Fetches deep Bangumi metadata for a single work:
 * - Full infobox (author/illustrator/publisher for books, developer/scenario for games, studio/director/script for anime)
 * - Collection counts (wish/collect/doing/on_hold/dropped) & 1..10 rating breakdown
 * - 6–10 characters prioritized by discussion counts, with biographies, CVs and 4–12 comments each
 * - 10–36 real Bangumi subject comments, scaled by collection / rating count
 * If any request fails, gracefully falls back to the work's existing basic metadata without losing any field.
 */
export async function fetchBangumiDeepSubjectData(anime: AnimeItem, options: { force?: boolean } = {}): Promise<AnimeItem> {
  if (!anime || !anime.id || anime.id <= 0 || anime.isCustom) {
    return anime;
  }
  if (!options.force && anime.deepDataVersion === DEEP_DATA_VERSION && anime.characters && anime.bgmNetizenComments) {
    return anime;
  }

  const mem = memoryDeepCache.get(anime.id);
  if (!options.force && mem?.deepDataVersion === DEEP_DATA_VERSION) {
    return {
      ...anime,
      ...mem,
      id: anime.id,
      title: anime.title || mem.title || `条目 #${anime.id}`,
      cover: anime.cover || mem.cover || '',
      deepEnriched: true,
    };
  }

  const localStore = readLocalDeepCache();
  const cachedPatch = localStore[String(anime.id)];
  if (!options.force && cachedPatch?.deepDataVersion === DEEP_DATA_VERSION) {
    memoryDeepCache.set(anime.id, cachedPatch);
    return {
      ...anime,
      ...cachedPatch,
      id: anime.id,
      title: anime.title || cachedPatch.title || `条目 #${anime.id}`,
      cover: anime.cover || cachedPatch.cover || '',
      deepEnriched: true,
    };
  }

  // 1. Try server / Cloudflare Pages Edge Function `/api/bangumi/subject-deep/:id`
  try {
    const res = await fetchAppApi(`/api/bangumi/subject-deep/${anime.id}${options.force ? '?refresh=1' : ''}`, { signal: AbortSignal.timeout(90000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.subject?.id) {
        const mappedSubject = mapBangumiSubjectToAnime(data.subject, false);
        const patch: Partial<AnimeItem> = {
          id: anime.id,
          title: anime.title || mappedSubject.title,
          originalTitle: anime.originalTitle || mappedSubject.originalTitle,
          cover: anime.cover || mappedSubject.cover,
          airDate: anime.airDate || mappedSubject.airDate,
          category: mappedSubject.category || anime.category,
          studio: mappedSubject.studio || anime.studio,
          director: mappedSubject.director || anime.director,
          scriptWriter: mappedSubject.scriptWriter || anime.scriptWriter,
          originalWork: mappedSubject.originalWork || anime.originalWork,
          author: mappedSubject.author || anime.author,
          illustrator: mappedSubject.illustrator || anime.illustrator,
          publisher: mappedSubject.publisher || anime.publisher,
          platform: mappedSubject.platform || anime.platform,
          volumes: mappedSubject.volumes || anime.volumes,
          eps: mappedSubject.eps || anime.eps,
          bgmScore: mappedSubject.bgmScore ?? anime.bgmScore,
          bgmRank: mappedSubject.bgmRank ?? anime.bgmRank,
          summary: mappedSubject.summary || anime.summary,
          tags:
            mappedSubject.tags && mappedSubject.tags.length > 0
              ? mappedSubject.tags
              : anime.tags,
          tagsWithCount: mappedSubject.tagsWithCount || anime.tagsWithCount,
          collectionStats: mappedSubject.collectionStats || anime.collectionStats,
          ratingTotal: mappedSubject.ratingTotal ?? anime.ratingTotal,
          ratingCounts: mappedSubject.ratingCounts || anime.ratingCounts,
          characters: data.characters?.length ? data.characters : anime.characters || [],
          bgmNetizenComments: data.bgmNetizenComments?.length
            ? data.bgmNetizenComments
            : anime.bgmNetizenComments || [],
          deepEnriched: true,
          deepDataVersion: data.deepDataVersion,
          discussionStatus: data.discussionStatus,
        };
        writeLocalDeepCache(anime.id, patch);
        return { ...anime, ...patch };
      }
    }
  } catch {
    // Fallback to direct browser requests
  }

  // 2. Direct browser fallback (for static web hosting)
  try {
    const token = getClientBgmToken();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const data = await fetchBangumiSubjectDetails(anime.id, async url => {
      const source = new URL(url);
      const discussion = /^\/p1\/(subjects|characters)\/(\d+)\/comments$/.exec(source.pathname);
      if (source.hostname === 'next.bgm.tv' && discussion) {
        const path = `/api/public-comments/${discussion[1]}/${discussion[2]}?limit=${Number(source.searchParams.get('limit')) || 12}`;
        const response = await fetch(path, { credentials: 'omit', cache: options.force ? 'no-cache' : 'default', signal: AbortSignal.timeout(20000) });
        return response.ok ? response.json() : null;
      }
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      return response.ok ? response.json() : null;
    });

    if (data?.subject?.id) {
      const mappedSubject = mapBangumiSubjectToAnime(data.subject, true);
      const patch: Partial<AnimeItem> = {
        id: anime.id,
        title: anime.title || mappedSubject.title,
        originalTitle: anime.originalTitle || mappedSubject.originalTitle,
        cover: anime.cover || mappedSubject.cover,
        airDate: anime.airDate || mappedSubject.airDate,
        category: mappedSubject.category || anime.category,
        studio: mappedSubject.studio || anime.studio,
        director: mappedSubject.director || anime.director,
        scriptWriter: mappedSubject.scriptWriter || anime.scriptWriter,
        originalWork: mappedSubject.originalWork || anime.originalWork,
        author: mappedSubject.author || anime.author,
        illustrator: mappedSubject.illustrator || anime.illustrator,
        publisher: mappedSubject.publisher || anime.publisher,
        platform: mappedSubject.platform || anime.platform,
        volumes: mappedSubject.volumes || anime.volumes,
        eps: mappedSubject.eps || anime.eps,
        bgmScore: mappedSubject.bgmScore ?? anime.bgmScore,
        bgmRank: mappedSubject.bgmRank ?? anime.bgmRank,
        summary: mappedSubject.summary || anime.summary,
        tags:
          mappedSubject.tags && mappedSubject.tags.length > 0
            ? mappedSubject.tags
            : anime.tags,
        tagsWithCount: mappedSubject.tagsWithCount || anime.tagsWithCount,
        collectionStats: mappedSubject.collectionStats || anime.collectionStats,
        ratingTotal: mappedSubject.ratingTotal ?? anime.ratingTotal,
        ratingCounts: mappedSubject.ratingCounts || anime.ratingCounts,
        characters: data.characters.length ? data.characters : anime.characters || [],
        bgmNetizenComments: data.bgmNetizenComments.length ? data.bgmNetizenComments : anime.bgmNetizenComments || [],
        deepEnriched: true,
        deepDataVersion: data.deepDataVersion,
        discussionStatus: data.discussionStatus,
      };
      writeLocalDeepCache(anime.id, patch);
      return { ...anime, ...patch };
    }
  } catch {
    // ignore fallback error
  }

  // Graceful fallback: mark as deepEnriched so we keep all basic data without endlessly retrying
  return { ...anime, deepEnriched: true, discussionStatus: { subject: 'unavailable', charactersRequested: 0, charactersFetched: 0, updatedAt: Date.now() } };
}

/**
 * Gently enriches all ranked works in a TierMap with deep Bangumi metadata (concurrency = 2, 120ms spacing)
 * and ALWAYS returns a valid TierMap preserving 100% of existing works.
 */
export async function enrichTierMapWithDeepBangumiData(
  tiers: TierMap,
  onProgress?: (completed: number, total: number) => void,
  options: { force?: boolean } = {},
): Promise<TierMap> {
  const safeTiers = normalizeTierMap(tiers);
  const toEnrich: Array<{ tierKey: string; idx: number; item: AnimeItem }> = [];
  for (const [tierKey, list] of Object.entries(safeTiers)) {
    if (!Array.isArray(list)) continue;
    list.forEach((item, idx) => {
      if (item && item.id > 0 && !item.isCustom && (options.force || item.deepDataVersion !== DEEP_DATA_VERSION)) {
        toEnrich.push({ tierKey, idx, item });
      }
    });
  }

  if (toEnrich.length === 0) {
    return safeTiers;
  }

  const nextTiers: TierMap = {};
  for (const [k, list] of Object.entries(safeTiers)) {
    nextTiers[k] = Array.isArray(list) ? [...list] : [];
  }

  let completed = 0;
  const total = toEnrich.length;
  const batchSize = 2;

  for (let i = 0; i < toEnrich.length; i += batchSize) {
    const batch = toEnrich.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ({ tierKey, idx, item }) => {
        try {
          const enriched = await fetchBangumiDeepSubjectData(item, options);
          if (enriched && enriched.id === item.id && enriched.title) {
            nextTiers[tierKey][idx] = enriched;
          }
        } catch {
          // Keep original item intact on any error
        } finally {
          completed++;
          onProgress?.(completed, total);
        }
      }),
    );
    if (i + batchSize < toEnrich.length) {
      await new Promise(r => setTimeout(r, 120));
    }
  }

  return nextTiers;
}

/**
 * Recovers works from `bgm-anitier:deep-subject-cache:v2` and user comments if a previous bug emptied `tiers`.
 */
export async function recoverSubjectsFromDeepCacheAndComments(
  comments: Array<{ id?: string; animeId: number; animeTitle: string; animeCover: string; tierScore?: number }>,
): Promise<Array<{ item: AnimeItem; score: number }>> {
  const localStore = readLocalDeepCache(true);
  const cachedIds = Object.keys(localStore)
    .map(Number)
    .filter(id => id > 0);

  const commentByAnimeId = new Map<
    number,
    { animeTitle: string; animeCover: string; tierScore?: number }
  >();
  for (const c of comments || []) {
    if (c && c.animeId > 0 && !String(c.id || '').startsWith('demo-c-')) {
      commentByAnimeId.set(c.animeId, c);
    }
  }

  const allCandidateIds = Array.from(new Set([...cachedIds, ...commentByAnimeId.keys()]));
  if (allCandidateIds.length === 0) return [];

  const recovered: Array<{ item: AnimeItem; score: number }> = [];
  for (const id of allCandidateIds) {
    const patch = localStore[String(id)] || {};
    const commentInfo = commentByAnimeId.get(id);
    const score =
      commentInfo?.tierScore && commentInfo.tierScore >= 1 && commentInfo.tierScore <= 10
        ? commentInfo.tierScore
        : 8;

    if (patch.title && patch.cover) {
      recovered.push({
        item: {
          id,
          title: patch.title,
          cover: patch.cover,
          ...patch,
          deepEnriched: true,
        } as AnimeItem,
        score,
      });
      continue;
    }

    // Fetch subject detail from Bangumi to reconstruct title & cover
    try {
      const detail = await fetchBangumiSubjectDetail(id);
      if (detail && detail.title) {
        recovered.push({
          item: {
            ...detail,
            ...patch,
            id,
            title: detail.title,
            cover: detail.cover || commentInfo?.animeCover || `/api/bangumi/cover/${id}`,
            deepEnriched: true,
          },
          score,
        });
        continue;
      }
    } catch {
      // ignore
    }

    if (commentInfo?.animeTitle) {
      recovered.push({
        item: {
          id,
          title: commentInfo.animeTitle,
          cover: commentInfo.animeCover || `/api/bangumi/cover/${id}`,
          ...patch,
        },
        score,
      });
    }
  }

  return recovered;
}



