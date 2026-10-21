import type { AppData, Character, Quest } from './types';

export const starterCharacter: Character = {
  id: 'starter-xiaohe',
  name: '小禾',
  description: '住在晨光村的园丁。相信再大的目标，也能从一颗小小的种子开始。',
  backstory: '我住在晨光村，照料村里的花园。我相信再大的目标，也能从一颗小小的种子开始。',
  lore: [{ kind: '身份', fact: '住在晨光村的园丁，照料村里的花园。', quote: '住在晨光村的园丁。' }],
  traits: ['温柔', '认真', '爱鼓励人'],
  voice: ['用简短、温暖的句子说话', '把任务比作照料花园'],
  appearance: [],
  catchphrases: ['先种下一颗小种子吧。'],
  boundaries: ['不责备未完成任务的人', '不擅自修改日程'],
  evidence: [],
  sampleLines: [
    { scene: '发布任务', line: '今天的冒险已经写在公告板上啦。先从一件小事开始吧。' },
    { scene: '开始专注', line: '先种下一颗小种子吧。我会陪你守着它。' },
    { scene: '任务完成', line: '看呀，你的努力已经开出一朵小花了。' },
    { scene: '暂时没完成', line: '花也有慢慢长大的时候。我们明天再试一次。' },
  ],
  mode: 'starter',
};

function todayAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const examples: Quest[] = [
  { id: 'sample-1', title: '整理今天的计划', note: '挑出最重要的三件事', dueAt: todayAt(10), category: '生活', done: false, createdAt: new Date().toISOString(), questLine: '先看看今天的地图吧，每一步都算数。' },
  { id: 'sample-2', title: '专注完成一件小事', note: '试一次 25 分钟专注', dueAt: todayAt(16), category: '工作', done: false, createdAt: new Date().toISOString(), questLine: '先种下一颗小种子吧，我会陪你。' },
  { id: 'sample-3', title: '给自己留一点休息时间', note: '喝水、走走、看看窗外', dueAt: todayAt(21), category: '生活', done: false, createdAt: new Date().toISOString(), questLine: '照顾好自己，也是很重要的任务。' },
];

export function initialData(): AppData {
  return { character: starterCharacter, quests: examples, sessions: [], coins: 0,
    messages: [{ id: 'welcome', role: 'character', text: '嗨，我在这儿。想聊什么就说吧；需要安排日程，我也可以帮你。', createdAt: new Date().toISOString() }],
    pendingPlan: null,
  };
}

const storageKey = 'little-quest-data-v1';

export function loadData(): AppData {
  try {
    if (localStorage.getItem('little-quest-data-owner-v1') && !localStorage.getItem('little-quest-session-v1')) return initialData();
    const raw = localStorage.getItem(storageKey);
    if (!raw) return initialData();
    const saved = JSON.parse(raw) as AppData;
    if (!saved.character || !Array.isArray(saved.quests) || !Array.isArray(saved.sessions)) return initialData();
    return { ...saved, character: { ...saved.character, backstory: saved.character.backstory || saved.character.description, lore: Array.isArray(saved.character.lore) ? saved.character.lore : [] }, messages: Array.isArray(saved.messages) ? saved.messages : initialData().messages,
      pendingPlan: saved.pendingPlan || null };
  } catch { return initialData(); }
}

export function saveData(data: AppData) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

export function dateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function formatTime(iso: string) {
  if (!iso) return '任意时间';
  const date = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function isToday(iso: string) {
  if (!iso) return true;
  return new Date(iso).toDateString() === new Date().toDateString();
}
