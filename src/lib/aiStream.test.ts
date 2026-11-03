import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAiStream } from './aiStream';

test('studio streams directly with the user key and preserves provider rejection', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response('invalid key', { status: 401 });
  };
  try {
    const response = await requestAiStream({ baseUrl: 'https://example.test/v1/', apiKey: ' user-only ', model: 'chosen-model' }, '台本');
    assert.equal(response.status, 401);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://example.test/v1/chat/completions');
    assert.equal(new Headers(requests[0].init?.headers).get('Authorization'), 'Bearer user-only');
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { model: 'chosen-model', messages: [{ role: 'user', content: '台本' }], stream: true });
  } finally { globalThis.fetch = originalFetch; }
});

test('local development falls back to the existing stream proxy only for network failure', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (urls.length === 1) throw new TypeError('CORS');
    return new Response('data: [DONE]');
  };
  try {
    await requestAiStream({ baseUrl: 'https://example.test/v1/chat/completions', apiKey: 'user-only', model: '' }, '台本');
    assert.deepEqual(urls, ['https://example.test/v1/chat/completions', '/api/ai/custom-stream']);
  } finally { globalThis.fetch = originalFetch; }
});
