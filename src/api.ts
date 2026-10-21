import type { CharacterCard, PlanItem, Scene } from './types';
import { offlinePlan } from './offlinePlan';
import { getSessionToken } from './accountApi';
import { getApiBaseUrl } from './serverUrl';


function characterText(card: CharacterCard): CharacterCard {
  return {
    name: card.name, description: card.description, backstory: card.backstory || '', lore: card.lore || [], traits: card.traits, voice: card.voice, appearance: card.appearance || [],
    catchphrases: card.catchphrases, boundaries: card.boundaries,
    evidence: card.evidence, sampleLines: card.sampleLines,
  };
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : {}) },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result as T;
}

export async function getStatus(): Promise<{ aiEnabled: boolean; mode: 'ai' | 'demo' }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/status`);
    if (!response.ok) throw new Error('服务未启动');
    return response.json();
  } catch { return { aiEnabled: false, mode: 'demo' }; }
}

export async function distill(input: { name: string; description: string; dialogue: string }) {
  try { return await post<{ mode: 'ai' | 'demo'; card: CharacterCard }>('/api/distill', input); }
  catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const quotes = input.dialogue.split(/[\n。！？!?]+/).map((line) => line.trim()).filter((line) => line.length >= 3).slice(0, 4);
    return { mode: 'demo' as const, card: {
      name: input.name.trim(), description: input.description.trim() || '你的日常任务伙伴', backstory: input.description.trim(), lore: [],
      traits: ['亲切', '认真'], voice: ['用简短自然的中文说话'], appearance: [], catchphrases: quotes.slice(0, 2),
      boundaries: ['不编造角色经历', '不擅自修改日程'],
      evidence: quotes.map((quote) => ({ claim: '说话方式参考', quote })),
      sampleLines: [
        { scene: '发布任务', line: quotes[0] || '今天有什么想做的？告诉我吧。' },
        { scene: '开始专注', line: '准备好就开始吧，我会陪着你。' },
        { scene: '任务完成', line: '完成了，我看见你的努力了。' },
        { scene: '暂时没完成', line: '没关系，我们再调整一下。' },
      ],
    } };
  }
}

export async function distillText(input: { name: string; description: string; dialogue: string; text: string },
  onProgress: (done: number, total: number) => void) {
  const { id } = await post<{ id: string }>('/api/distill/jobs', input);
  for (let attempt = 0; attempt < 600; attempt++) {
    const token = getSessionToken();
    const response = await fetch(`${getApiBaseUrl()}/api/distill/jobs/${id}`, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const job = await response.json();
    if (!response.ok || job.status === 'error') throw new Error(job.error || '蒸馏失败');
    onProgress(job.progress || 0, job.total || 1);
    if (job.status === 'done') return job as { mode: 'ai' | 'demo'; card: CharacterCard; stats: { sourceChars: number; analyzedChars: number; mentions: number; excerpts: number } };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('蒸馏等待超时，请稍后重试');
}

export function characterLine(input: { character: CharacterCard; scene: Scene; taskTitle: string }) {
  return post<{ mode: 'ai' | 'demo'; line: string }>('/api/line', { ...input, character: characterText(input.character) });
}

export async function planDay(input: { message: string; localNow: string; character: CharacterCard; existingPlan?: { items: PlanItem[] } | null;
  context?: { messages: { role: string; text: string }[]; upcoming: { title: string; startLocal: string; durationMinutes: number }[] } }) {
  try { return await post<{ mode: 'ai' | 'demo'; plan: { reply: string; items: PlanItem[] } }>('/api/plan', { ...input, character: characterText(input.character) }); }
  catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return { mode: 'demo' as const, plan: offlinePlan(input.message, input.localNow, input.existingPlan) };
  }
}
