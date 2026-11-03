import type { AIConfig } from '../types';
import { fetchAppApi } from './runtime';

export async function requestAiStream(config: Pick<AIConfig, 'apiKey' | 'baseUrl' | 'model'>, prompt: string): Promise<Response> {
  const apiKey = config.apiKey.trim();
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const model = config.model.trim() || 'gemini-2.5-flash';
  if (!apiKey) {
    return fetchAppApi('/api/gemini/stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model }),
    });
  }
  if (!baseUrl) throw new Error('请在 API 设置中填写服务地址。');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true }),
    });
  } catch {
    return fetchAppApi('/api/ai/custom-stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey, model, prompt }),
    });
  }
}
