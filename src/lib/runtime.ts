// Pages runs browser features plus a separate public-comments relay; Express APIs stay local.
export const IS_STATIC_HOSTING = import.meta.env?.MODE === 'static';

export async function fetchAppApi(path: string, init?: RequestInit): Promise<Response> {
  if (IS_STATIC_HOSTING) {
    throw new Error(path.startsWith('/api/gemini/')
      ? '请先在「API 设置」中填写你自己的 API Key 和服务地址。'
      : '当前服务无法从浏览器直接访问，请检查网络或使用支持浏览器跨域访问（CORS）的 API 服务。');
  }
  return fetch(path, init);
}
