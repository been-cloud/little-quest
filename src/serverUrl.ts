const key = 'little-quest-api-url-v1';

export function getApiBaseUrl() {
  return (localStorage.getItem(key) || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
}

export function setApiBaseUrl(value: string) {
  const url = value.trim().replace(/\/$/, '');
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); }
    catch { throw new Error('服务器地址格式不正确'); }
    const host = parsed.hostname;
    const ipv4 = host.split('.').map(Number);
    const privateIpv4 = ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
      (ipv4[0] === 10 || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168));
    const localHttp = parsed.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || privateIpv4);
    if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('请输入 HTTPS 地址；电脑局域网服务器可用 http://内网IP:8788');
    }
  }
  if (url) localStorage.setItem(key, url);
  else localStorage.removeItem(key);
}
