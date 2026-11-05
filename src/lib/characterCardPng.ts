import type { WorldBookEntry } from '../types';
import {
  normalizeStudioCompanions,
  type StudioCharacterConfig,
} from './studioDirector';

export interface StudioCharacterCardPayload {
  format?: 'bgm-anitier-character-card-v1';
  exportedAt?: string;
  role?: 'ai' | 'user';
  character: StudioCharacterConfig;
  worldBookEntries?: WorldBookEntry[];
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function encodeBase64Utf8(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < utf8.length; i++) {
    binary += String.fromCharCode(utf8[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(utf8).toString('base64');
}

function decodeBase64Utf8(b64: string): string {
  if (typeof atob === 'function') {
    const binary = atob(b64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64.trim(), 'base64').toString('utf8');
}

function createTextChunk(keyword: string, textValue: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword);
  const valueBytes = new TextEncoder().encode(textValue);
  const dataLength = keywordBytes.length + 1 + valueBytes.length;
  const chunk = new Uint8Array(4 + 4 + dataLength + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, dataLength, false);
  // 'tEXt'
  chunk[4] = 0x74;
  chunk[5] = 0x45;
  chunk[6] = 0x58;
  chunk[7] = 0x74;

  chunk.set(keywordBytes, 8);
  chunk[8 + keywordBytes.length] = 0; // null separator
  chunk.set(valueBytes, 8 + keywordBytes.length + 1);

  const crcInput = chunk.subarray(4, 8 + dataLength);
  view.setUint32(8 + dataLength, crc32(crcInput), false);
  return chunk;
}

export function isPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Embeds a StudioCharacterCardPayload into a PNG byte array using standard PNG `tEXt` chunks
 * (`anitier_chara` and SillyTavern-compatible `chara` base64 JSON) right before `IEND`.
 */
export function embedCharacterCardInPngBytes(
  pngBytes: Uint8Array,
  payload: StudioCharacterCardPayload,
): Uint8Array {
  if (!isPngBytes(pngBytes)) {
    throw new Error('提供的文件不是有效的 PNG 图片');
  }

  const jsonText = JSON.stringify(payload);
  const encodedBase64 = encodeBase64Utf8(jsonText);
  const anitierChunk = createTextChunk('anitier_chara', encodedBase64);
  const charaChunk = createTextChunk('chara', encodedBase64);

  const keptChunks: Uint8Array[] = [pngBytes.subarray(0, 8)];
  let offset = 8;
  let inserted = false;

  while (offset + 8 <= pngBytes.length) {
    const view = new DataView(pngBytes.buffer, pngBytes.byteOffset + offset, 8);
    const length = view.getUint32(0, false);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7],
    );
    const totalChunkLength = 4 + 4 + length + 4;
    if (offset + totalChunkLength > pngBytes.length) break;

    if (type === 'tEXt') {
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      let nullIdx = dataStart;
      while (nullIdx < dataEnd && pngBytes[nullIdx] !== 0) nullIdx++;
      const keyword = new TextDecoder().decode(pngBytes.subarray(dataStart, nullIdx));
      if (keyword === 'anitier_chara' || keyword === 'chara') {
        offset += totalChunkLength;
        continue;
      }
    }

    if (type === 'IEND' && !inserted) {
      keptChunks.push(anitierChunk, charaChunk);
      inserted = true;
    }

    keptChunks.push(pngBytes.subarray(offset, offset + totalChunkLength));
    offset += totalChunkLength;
  }

  if (!inserted) {
    throw new Error('PNG 文件缺少 IEND 结束块');
  }

  const totalSize = keptChunks.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalSize);
  let writeOffset = 0;
  for (const part of keptChunks) {
    output.set(part, writeOffset);
    writeOffset += part.length;
  }
  return output;
}

export function normalizeCharacterCardPayload(raw: unknown): StudioCharacterCardPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('角色卡数据格式无效');
  }
  const obj = raw as Record<string, any>;
  const charCandidate = obj.character && typeof obj.character === 'object' ? obj.character : obj;
  if (!charCandidate || typeof charCandidate.name !== 'string') {
    throw new Error('角色卡缺少角色名称或人设字段');
  }

  const normalizedList = normalizeStudioCompanions([
    {
      ...charCandidate,
      id:
        typeof charCandidate.id === 'string' && charCandidate.id.trim()
          ? charCandidate.id.trim()
          : `studio-custom-${Date.now()}`,
      isCustom: true,
    },
  ]);
  const customChar = normalizedList.find(c => c.name === charCandidate.name) || normalizedList[0];

  const worldBookEntries = Array.isArray(obj.worldBookEntries)
    ? obj.worldBookEntries.filter(
        (e: any) => e && typeof e.title === 'string' && typeof e.content === 'string',
      )
    : undefined;

  return {
    format: 'bgm-anitier-character-card-v1',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    ...(obj.role === 'user' || obj.role === 'ai' ? { role: obj.role } : {}),
    character: {
      ...customChar,
      id:
        customChar.id === 'studio-feiyu' || customChar.id === 'user-host'
          ? `studio-custom-${Date.now()}`
          : customChar.id,
      isCustom: true,
    },
    ...(worldBookEntries && worldBookEntries.length > 0 ? { worldBookEntries } : {}),
  };
}

/**
 * Extracts a StudioCharacterCardPayload from PNG `tEXt` chunks (`anitier_chara` or `chara`).
 */
export function extractCharacterCardFromPngBytes(
  pngBytes: Uint8Array,
): StudioCharacterCardPayload | null {
  if (!isPngBytes(pngBytes)) return null;

  let offset = 8;
  let fallbackCharaText: string | null = null;

  while (offset + 8 <= pngBytes.length) {
    const view = new DataView(pngBytes.buffer, pngBytes.byteOffset + offset, 8);
    const length = view.getUint32(0, false);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7],
    );
    const totalChunkLength = 4 + 4 + length + 4;
    if (offset + totalChunkLength > pngBytes.length) break;

    if (type === 'tEXt') {
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      let nullIdx = dataStart;
      while (nullIdx < dataEnd && pngBytes[nullIdx] !== 0) nullIdx++;
      if (nullIdx < dataEnd) {
        const keyword = new TextDecoder().decode(pngBytes.subarray(dataStart, nullIdx));
        const rawValue = new TextDecoder().decode(pngBytes.subarray(nullIdx + 1, dataEnd));
        if (keyword === 'anitier_chara') {
          try {
            const parsed = JSON.parse(decodeBase64Utf8(rawValue));
            return normalizeCharacterCardPayload(parsed);
          } catch {
            // Try plain JSON fallback
            try {
              return normalizeCharacterCardPayload(JSON.parse(rawValue));
            } catch {
              // continue
            }
          }
        } else if (keyword === 'chara' && !fallbackCharaText) {
          fallbackCharaText = rawValue;
        }
      }
    }

    offset += totalChunkLength;
  }

  if (fallbackCharaText) {
    try {
      const parsed = JSON.parse(decodeBase64Utf8(fallbackCharaText));
      if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object') {
        const stData = parsed.data;
        if (stData.extensions?.bgm_anitier_character) {
          return normalizeCharacterCardPayload(stData.extensions.bgm_anitier_character);
        }
        return normalizeCharacterCardPayload({
          name: stData.name || parsed.name || '导入角色',
          prompt: stData.description || stData.personality || parsed.description || '',
          defaultAvatarUrl: '',
          customExpressions: [],
        });
      }
      return normalizeCharacterCardPayload(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

export function parseCharacterCardImportBytes(bytes: Uint8Array): StudioCharacterCardPayload {
  if (isPngBytes(bytes)) {
    const extracted = extractCharacterCardFromPngBytes(bytes);
    if (!extracted) {
      throw new Error('这张 PNG 图片中未检测到嵌入的角色卡数据（请选择由本应用或酒馆导出的角色卡 PNG）');
    }
    return extracted;
  }
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件既不是有效的角色卡 PNG，也不是合法的 JSON 文件');
  }
  return normalizeCharacterCardPayload(parsed);
}

/**
 * Renders a visual Character Card PNG in the browser and embeds the full StudioCharacterCardPayload
 * inside its PNG `tEXt` metadata chunk.
 */
export async function buildCharacterCardPngBlob(
  payload: StudioCharacterCardPayload,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('浏览器不支持 Canvas 绘图');
  }

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 720, 960);
  grad.addColorStop(0, '#12131c');
  grad.addColorStop(0.5, '#181a28');
  grad.addColorStop(1, '#0d0e15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 720, 960);

  // Subtle card border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 672, 912);

  // Inner frame
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(48, 90, 624, 540);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 90, 624, 540);

  // Header label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('BGM ANITIER · STUDIO CHARACTER CARD', 48, 64);

  // Try drawing character avatar if CORS allows
  const avatarUrl =
    payload.character.defaultAvatarUrl ||
    payload.character.customExpressions?.[0]?.url ||
    '';
  if (avatarUrl) {
    await new Promise<void>(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const maxW = 460;
          const maxH = 460;
          const scale = Math.min(maxW / (img.naturalWidth || 400), maxH / (img.naturalHeight || 400));
          const drawW = (img.naturalWidth || 400) * scale;
          const drawH = (img.naturalHeight || 400) * scale;
          const drawX = 48 + (624 - drawW) / 2;
          const drawY = 90 + (540 - drawH) / 2;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } catch {
          // ignore tainted canvas draw
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = avatarUrl;
    });
  }

  // Character Name & Metadata
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(payload.character.name.slice(0, 18), 48, 696);

  const exprCount = payload.character.customExpressions?.length || 0;
  const wbCount = payload.worldBookEntries?.length || 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '600 20px sans-serif';
  ctx.fillText(
    `包含 ${exprCount} 项表情差分 · ${wbCount} 项世界书词条 · 嘴替音高 ${payload.character.voicePitch.toFixed(2)}x`,
    48,
    742,
  );

  // Prompt snippet preview
  const promptPreview = (payload.character.prompt || '自定义小剧场陪看搭档人设')
    .replace(/\s+/g, ' ')
    .slice(0, 82);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '16px sans-serif';
  ctx.fillText(promptPreview + (promptPreview.length >= 82 ? '…' : ''), 48, 790);

  // Footer instructions
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '15px monospace';
  ctx.fillText('将此 PNG 图片拖入或导入「小剧场 → 人设设置」即可一键还原人设与全部表情包', 48, 902);

  const rawBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('无法生成 PNG 数据'));
    }, 'image/png');
  });

  const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
  const fullPayload: StudioCharacterCardPayload = {
    format: 'bgm-anitier-character-card-v1',
    exportedAt: payload.exportedAt || new Date().toISOString(),
    ...payload,
  };
  const embeddedBytes = embedCharacterCardInPngBytes(rawBytes, fullPayload);
  return new Blob([new Uint8Array(embeddedBytes)], { type: 'image/png' });
}
