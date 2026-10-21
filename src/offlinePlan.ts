import type { PlanItem } from './types';

const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function addMinutes(local: string, minutes: number) {
  const date = new Date(`${local}:00Z`);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString().slice(0, 16);
}

function readTime(text: string) {
  const digital = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (digital) return { hour: Number(digital[1]), minute: Number(digital[2]), assumed: false };
  const match = text.match(/(早上|上午|中午|下午|傍晚|晚上|夜里|凌晨)?\s*([一二两三四五六七八九十\d]{1,3})点(半|\d{1,2}分)?/);
  if (!match) return null;
  let hour = /^\d+$/.test(match[2]) ? Number(match[2]) : cn[match[2]];
  const minute = match[3] === '半' ? 30 : match[3] ? Number(match[3].replace('分', '')) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  const assumed = !match[1] && hour >= 5 && hour <= 11;
  if ((assumed || /下午|傍晚|晚上|夜里/.test(match[1] || '')) && hour < 12) hour += 12;
  return { hour, minute, assumed };
}

export function offlinePlan(message: string, localNow: string, existing?: { items: PlanItem[] } | null): { reply: string; items: PlanItem[] } {
  const time = readTime(message);
  if (existing?.items.length && /改|调整|提前|推迟/.test(message) && time) {
    const index = Math.max(0, existing.items.findIndex((item) => message.toLowerCase().includes(item.title.replace(/学习$/, '').toLowerCase())));
    const startLocal = `${existing.items[index].startLocal.slice(0, 10)}T${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
    const items = existing.items.map((item, i) => i === index ? { ...item, startLocal, remindLocal: addMinutes(startLocal, -15) } : item);
    return { reply: `好，我把「${items[index].title}」改到了 ${startLocal.slice(11)}。你看看这样行吗？`, items };
  }
  const topics = message.replace(/[。！？!?]/g, '，').split(/[，,；;]/).map((part) => {
    const match = part.match(/(?:学习|复习|练习|学|写|读|做|整理|完成)\s*([A-Za-z\u4e00-\u9fff0-9\s]{1,35})/);
    if (!match) return '';
    const topic = match[1].replace(/(?:我|然后|之后|再|还要).*/g, '').replace(/(?:到|从)?[一二两三四五六七八九十\d]{1,3}点.*$/, '').trim();
    return topic ? `${topic}学习` : '';
  }).filter(Boolean).slice(0, 5);
  if (!topics.length) return { reply: '我在听。今天想做什么、几点能开始？随便说，我来帮你整理。', items: [] };
  const hour = time?.hour ?? Math.max(8, Math.min(22, Number(localNow.slice(11, 13)) + 1));
  const minute = time?.minute ?? 0;
  let start = `${localNow.slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const tomorrow = /明天/.test(message) || start <= localNow;
  if (tomorrow) start = addMinutes(start, 1440);
  const items = topics.map((title, index) => {
    const startLocal = addMinutes(start, index * 55);
    return { id: `draft-${index + 1}`, title, note: '', startLocal, remindLocal: addMinutes(startLocal, -15), durationMinutes: 45 };
  });
  return { reply: `${time?.assumed ? '我先把“七点”理解为晚上七点，' : ''}记下了：${tomorrow ? '明天' : '今天'} ${start.slice(11)} 开始，${topics.join('、')}。先按每项 45 分钟、间隔 10 分钟安排，第一项提前 15 分钟提醒。你看可以吗？`, items };
}
