const traitWords = [
  ['温柔', /温柔|轻声|陪伴|别着急|慢慢来/],
  ['活泼', /活泼|开心|耶|冲呀|冒险|加油/],
  ['冷静', /冷静|理性|沉稳|先想|步骤/],
  ['傲娇', /傲娇|才不是|别误会|哼/],
  ['严格', /严格|必须|现在就|不许|完成它/],
  ['幽默', /幽默|玩笑|哈哈|有趣/],
];

export function distillDemo({ name, description = '', dialogue = '' }) {
  const cleanName = String(name || '').trim().slice(0, 30) || '新伙伴';
  const source = `${description}\n${dialogue}`;
  const quotes = String(dialogue)
    .split(/[\n。！？!?]+/)
    .map((line) => line.replace(/^[\s"“「『\-—:：]+|[\s"”」』]+$/g, '').trim())
    .filter((line) => line.length >= 3 && line.length <= 80)
    .slice(0, 8);
  const traits = traitWords.filter(([, pattern]) => pattern.test(source)).map(([word]) => word);
  if (!traits.length) traits.push('亲切', '认真');
  const voice = [];
  if (/！|!/.test(dialogue)) voice.push('表达有活力，偶尔使用感叹句');
  if (/～|~/.test(dialogue)) voice.push('语气轻快，偶尔使用拖长音');
  if (/您|请/.test(dialogue)) voice.push('措辞礼貌');
  if (/哼|才不是/.test(dialogue)) voice.push('偶尔嘴硬，但会关心对方');
  if (!voice.length) voice.push('用简短、自然的中文说话');
  const catchphrases = quotes.filter((line) => line.length <= 25).slice(0, 3);
  const first = catchphrases[0] || '今天也从一件小事开始吧。';
  return {
    name: cleanName,
    description: String(description).trim().slice(0, 300) || '一个陪你完成日常任务的伙伴。',
    backstory: String(description).trim().slice(0, 1200),
    lore: [],
    traits,
    voice,
    appearance: [],
    catchphrases,
    boundaries: ['不编造素材中没有的角色经历', '不擅自修改任务名称、时间或完成状态'],
    evidence: quotes.slice(0, 3).map((quote) => ({ claim: '说话方式参考', quote })),
    sampleLines: [
      { scene: '发布任务', line: `${first} 今天有新的任务等着你。` },
      { scene: '开始专注', line: `${cleanName}会陪着你。先专注一小段时间吧。` },
      { scene: '任务完成', line: '做得好！这份努力我看见了。' },
      { scene: '暂时没完成', line: '没关系，调整计划后再继续就好。' },
    ],
  };
}

export function demoLine({ character, scene, taskTitle }) {
  const name = String(character?.name || '伙伴').slice(0, 30);
  const task = String(taskTitle || '今天的任务').slice(0, 80);
  const phrase = character?.catchphrases?.[0];
  const prefix = typeof phrase === 'string' && phrase.length <= 24 ? `${phrase} ` : '';
  switch (scene) {
    case 'start': return `${prefix}${name}在这里。先专注一小段时间吧。`;
    case 'complete': return `${prefix}完成「${task}」！这份努力我记下了。`;
    case 'missed': return `「${task}」还没完成。我们可以调整计划，再慢慢来。`;
    case 'reward': return `任务完成，收下今天的小小奖励吧！`;
    case 'reminder': return `别忘了「${task}」哦。我们约好的时间快到了。`;
    case 'accepted': return `好，我把「${task}」记下了。到时候提醒你。`;
    default: return `${prefix}新任务「${task}」已经准备好啦。`;
  }
}

const chineseDigits = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

function numberFromChinese(value) {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (chineseDigits[value[1]] || 0);
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (chineseDigits[tens] || 0) * 10 + (chineseDigits[ones] || 0);
  }
  return chineseDigits[value] ?? NaN;
}

function requestedTime(message) {
  const digital = message.match(/\b(\d{1,2}):(\d{2})\b/);
  if (digital) return { hour: Number(digital[1]), minute: Number(digital[2]), assumedEvening: false };
  const match = message.match(/(早上|上午|中午|下午|傍晚|晚上|夜里|凌晨)?\s*([零一二两三四五六七八九十\d]{1,3})点(半|[零一二两三四五六七八九十\d]{1,2}分)?/);
  if (!match) return null;
  let hour = numberFromChinese(match[2]);
  let minute = match[3] === '半' ? 30 : match[3] ? numberFromChinese(match[3].replace('分', '')) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  const period = match[1] || '';
  const assumedEvening = !period && hour >= 5 && hour <= 11;
  if ((/下午|傍晚|晚上|夜里/.test(period) || assumedEvening) && hour < 12) hour += 12;
  if (period === '中午' && hour < 11) hour += 12;
  if (period === '凌晨' && hour === 12) hour = 0;
  return { hour, minute, assumedEvening };
}

function addLocalMinutes(value, minutes) {
  const date = new Date(`${value}:00Z`);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString().slice(0, 16);
}

function extractTopics(message) {
  const chunks = message.replace(/[。！？!?]/g, '，').split(/[，,；;]/).map((item) => item.trim()).filter(Boolean);
  const tasks = [];
  for (const chunk of chunks) {
    const match = chunk.match(/(?:学习|复习|练习|学|写|读|做|整理|完成)\s*([A-Za-z\u4e00-\u9fff0-9\s]{1,35})/);
    if (!match) continue;
    let topic = match[1].replace(/(?:我|然后|之后|再|还要).*/g, '').replace(/(?:到|从)?[零一二两三四五六七八九十\d]{1,3}点.*$/, '').trim();
    topic = topic.replace(/^(?:一下|一点|一会儿)/, '').trim();
    if (!topic) continue;
    const verb = match[0].slice(0, match[0].indexOf(match[1])).trim();
    const title = /学|复习|练习/.test(verb) ? `${topic}学习` : `${verb}${topic}`;
    if (!tasks.includes(title)) tasks.push(title);
  }
  return tasks.slice(0, 5);
}

export function planDemo({ message, localNow, existingPlan }) {
  const text = String(message || '').trim();
  const now = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localNow || '') ? localNow : new Date().toISOString().slice(0, 16);
  const time = requestedTime(text);
  const oldItems = Array.isArray(existingPlan?.items) ? existingPlan.items : [];
  if (oldItems.length && /改|调整|换到|提前|推迟/.test(text) && time) {
    const targetIndex = oldItems.findIndex((item) => text.toLowerCase().includes(item.title.replace(/学习$/, '').toLowerCase()));
    const index = targetIndex >= 0 ? targetIndex : 0;
    const day = oldItems[index].startLocal.slice(0, 10);
    const startLocal = `${day}T${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
    const items = oldItems.map((item, i) => i === index ? { ...item, startLocal, remindLocal: addLocalMinutes(startLocal, -15) } : item);
    return { reply: `好，我把「${items[index].title}」改到了 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}。你看看这样行吗？`, items };
  }
  const topics = extractTopics(text);
  if (!topics.length) return { reply: conversationDemo(text), items: [] };
  const nowHour = Number(now.slice(11, 13));
  const defaultHour = Math.max(8, Math.min(22, nowHour + 1));
  const hour = time?.hour ?? defaultHour;
  const minute = time?.minute ?? 0;
  let startLocal = `${now.slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const tomorrow = /明天/.test(text) || startLocal <= now;
  if (tomorrow) startLocal = addLocalMinutes(startLocal, 24 * 60);
  const items = topics.map((title, index) => {
    const taskStart = addLocalMinutes(startLocal, index * 55);
    return { id: `draft-${index + 1}`, title, note: '', startLocal: taskStart, remindLocal: addLocalMinutes(taskStart, -15), durationMinutes: 45 };
  });
  const dayWord = tomorrow ? '明天' : '今天';
  const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const assumption = time?.assumedEvening ? '我先把“七点”理解为晚上七点，' : '';
  return {
    reply: `${assumption}记下了：${dayWord} ${timeLabel} 开始，${topics.join('、')}。我先按每项 45 分钟、间隔 10 分钟安排；第一项会提前 15 分钟提醒你。你看这样可以吗？`,
    items,
  };
}

export function conversationDemo(message) {
  const text = String(message || '').trim();
  if (/听(得|的)?(见|到)|能听|在吗|理我/.test(text)) return '我看到了你的消息。刚才没接住你的问题，抱歉。你直接说，我会认真回答。';
  if (/你是谁|叫什么|名字/.test(text)) return '我是陪你聊天、安排日程的伙伴。你可以在角色工坊给我换成喜欢的角色。';
  if (/你好|早上好|晚上好|嗨|哈喽/.test(text)) return '你好，我在这儿。想聊什么都可以直接说。';
  if (/谢谢/.test(text)) return '不客气，我会陪着你。';
  if (/\?|？|怎么|为什么|什么|吗/.test(text)) return '我听见你的问题了。现在是离线演示模式，没法可靠回答这个问题；连上 DeepSeek 后再问我一次。';
  return '我在听。你可以直接跟我聊天，也可以告诉我想安排什么。';
}

export const planSchema = {
  type: 'object', additionalProperties: false, required: ['reply', 'items'],
  properties: {
    reply: { type: 'string' },
    items: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'title', 'note', 'startLocal', 'remindLocal', 'durationMinutes'],
      properties: {
        id: { type: 'string' }, title: { type: 'string' }, note: { type: 'string' },
        startLocal: { type: 'string' }, remindLocal: { type: 'string' }, durationMinutes: { type: 'integer' },
      },
    } },
  },
};

export const cardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'backstory', 'lore', 'traits', 'voice', 'appearance', 'catchphrases', 'boundaries', 'evidence', 'sampleLines'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    backstory: { type: 'string' },
    lore: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'fact', 'quote'], properties: {
      kind: { type: 'string' }, fact: { type: 'string' }, quote: { type: 'string' },
    } } },
    traits: { type: 'array', items: { type: 'string' } },
    voice: { type: 'array', items: { type: 'string' } },
    appearance: { type: 'array', items: { type: 'string' } },
    catchphrases: { type: 'array', items: { type: 'string' } },
    boundaries: { type: 'array', items: { type: 'string' } },
    evidence: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['claim', 'quote'],
        properties: { claim: { type: 'string' }, quote: { type: 'string' } },
      },
    },
    sampleLines: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['scene', 'line'],
        properties: { scene: { type: 'string' }, line: { type: 'string' } },
      },
    },
  },
};

export function verifiedLore(items, source, limit = 96) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item || typeof item.kind !== 'string' || typeof item.fact !== 'string' || typeof item.quote !== 'string') return false;
    const fact = item.fact.trim();
    const quote = item.quote.trim();
    if (fact.length < 3 || fact.length > 180 || quote.length < 3 || quote.length > 120 || !source.includes(quote)) return false;
    const key = fact.replace(/[\s，。！？、]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    item.kind = item.kind.trim().slice(0, 20);
    item.fact = fact;
    item.quote = quote;
    return true;
  }).slice(0, limit);
}

export function selectRelevantLore(lore, message, limit = 16) {
  if (!Array.isArray(lore)) return [];
  const query = String(message || '').toLowerCase();
  const grams = new Set([...query].map((_, index) => query.slice(index, index + 2)).filter((gram) => gram.length === 2 && /[\p{L}\p{N}]/u.test(gram)));
  const pastQuestion = /以前|过去|身世|经历|小时候|上线前|原来|曾经|记得|出生|来自|地球|故乡|家人|朋友/.test(query);
  return lore.map((item, index) => {
    const haystack = `${item.kind || ''} ${item.fact || ''} ${item.quote || ''}`.toLowerCase();
    const overlap = [...grams].reduce((score, gram) => score + (haystack.includes(gram) ? 1 : 0), 0);
    const backstoryBoost = pastQuestion && /身份|经历|过去|世界|关系|家人|成长|故乡|起源|背景/.test(item.kind || '') ? 2 : 0;
    return { item, index, score: overlap + backstoryBoost };
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(({ item }) => item);
}

export async function modelJson({ instructions, input, schema, name, maxOutputTokens = 2500 }) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('尚未配置 DeepSeek API Key');
  for (let attempt = 0; attempt < 2; attempt++) {
  const response = await fetch('https://api.deepseek.com/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      instructions: `${instructions}\n必须只返回符合 JSON schema 的 JSON 对象。不要在 JSON 前后添加任何文字或代码块。`,
      input,
      reasoning: { effort: 'none' },
      max_output_tokens: maxOutputTokens,
      text: { format: { type: 'json_schema', name, schema } },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    throw new Error(`模型请求失败 (${response.status})，请检查密钥、余额与网络`);
  }
  const result = await response.json();
  if (result.status !== 'completed') {
    if (attempt === 0) continue;
    throw new Error(`模型输出未完成：${result.incomplete_details?.reason || result.status || '未知原因'}`);
  }
  const content = result.output?.flatMap((item) => item.content || []) || [];
  const text = content.filter((item) => item.type === 'output_text').map((item) => item.text).join('');
  try {
    if (!text) throw new Error('empty');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    if (attempt === 1) throw new Error('模型没有返回规范 JSON，请稍后重试');
  }
  }
  throw new Error('模型没有返回有效内容');
}
