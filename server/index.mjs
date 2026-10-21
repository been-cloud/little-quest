import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardSchema, demoLine, distillDemo, modelJson, planDemo, planSchema, selectRelevantLore, verifiedLore } from './logic.mjs';
import { distillLongText, MAX_SOURCE_CHARS } from './longText.mjs';
import { randomUUID } from 'node:crypto';
import { AccountStore } from './auth.mjs';
import { createAuthRouter } from './authRoutes.mjs';
import { mailConfigured, sendRegistrationCode } from './mail.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT) || 8787;
const accounts = new AccountStore(process.env.ACCOUNT_DB_PATH || join(root, 'server', 'data', 'accounts.json'));
const authRoute = createAuthRouter({ store: accounts, sendCode: sendRegistrationCode });
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'capacitor://localhost,http://localhost,https://localhost,http://localhost:5173').split(',').map((item) => item.trim()));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function body(req, limit = 150000) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('上传内容超过大小限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const jobs = new Map();
function startDistillJob(input) {
  const id = randomUUID();
  const job = { status: 'working', progress: 0, total: 1, createdAt: Date.now() };
  jobs.set(id, job);
  void distillLongText({ ...input, onProgress: (progress, total) => { job.progress = progress; job.total = total; } })
    .then((result) => { job.status = 'done'; job.result = result; })
    .catch((error) => { job.status = 'error'; job.error = error instanceof Error ? error.message : '蒸馏失败'; });
  return id;
}

async function serveFile(res, path) {
  const clean = normalize(decodeURIComponent(path)).replace(/^([/\\]|\.\.[/\\])+/, '');
  const base = join(root, 'dist');
  const target = join(base, clean);
  if (!target.startsWith(base)) return json(res, 403, { error: 'Forbidden' });
  let file = target;
  try {
    if (!(await stat(file)).isFile()) file = join(base, 'index.html');
  } catch {
    file = join(base, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { json(res, 404, { error: '请先运行 npm run build' }); }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  const origin = req.headers.origin;
  if (path === '/api/auth/code') {
    console.log(`Verification request: ${req.method} from ${req.socket.remoteAddress || 'unknown'}; origin=${origin || 'none'}`);
  }
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (path === '/api/status' && req.method === 'GET') {
      return json(res, 200, { aiEnabled: Boolean(process.env.DEEPSEEK_API_KEY), mode: process.env.DEEPSEEK_API_KEY ? 'ai' : 'demo', provider: 'DeepSeek', mailEnabled: mailConfigured() });
    }
    if (path.startsWith('/api/auth/') || path === '/api/sync') {
      const input = req.method === 'POST' || req.method === 'PUT' ? await body(req, path === '/api/sync' ? 6000000 : 10000) : {};
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const result = await authRoute(path, req.method, input, token);
      return json(res, result.status, result.body);
    }
    if ((process.env.AUTH_REQUIRED === 'true' || process.env.NODE_ENV === 'production') && path.startsWith('/api/')) {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!await accounts.currentUser(token)) return json(res, 401, { error: '请先登录' });
    }
    if (path === '/api/distill/jobs' && req.method === 'POST') {
      const input = await body(req, 25000000);
      const name = String(input.name || '').trim().slice(0, 30);
      const sourceText = String(input.text || '');
      if (!name || !sourceText.trim()) return json(res, 400, { error: '请填写角色名字并上传非空 TXT' });
      if (sourceText.length > MAX_SOURCE_CHARS) return json(res, 400, { error: 'TXT 文件过大，请控制在 20 MB 以内' });
      if ([...jobs.values()].filter((job) => job.status === 'working').length >= 2) return json(res, 429, { error: '当前有较多蒸馏任务，请稍后再试' });
      for (const [id, job] of jobs) if (Date.now() - job.createdAt > 30 * 60 * 1000) jobs.delete(id);
      const id = startDistillJob({ name, text: sourceText, description: String(input.description || '').slice(0, 3000), dialogue: String(input.dialogue || '').slice(0, 12000) });
      return json(res, 202, { id });
    }
    if (path.startsWith('/api/distill/jobs/') && req.method === 'GET') {
      const job = jobs.get(path.slice('/api/distill/jobs/'.length));
      if (!job) return json(res, 404, { error: '蒸馏任务已过期' });
      return json(res, 200, { status: job.status, progress: job.progress, total: job.total,
        ...(job.status === 'done' ? { mode: process.env.DEEPSEEK_API_KEY ? 'ai' : 'demo', ...job.result } : {}),
        ...(job.status === 'error' ? { error: job.error } : {}) });
    }
    if (path === '/api/distill' && req.method === 'POST') {
      const input = await body(req);
      const name = String(input.name || '').trim().slice(0, 30);
      const description = String(input.description || '').trim().slice(0, 3000);
      const dialogue = String(input.dialogue || '').trim().slice(0, 12000);
      if (!name || (!description && !dialogue)) return json(res, 400, { error: '请填写角色名和角色素材' });
      if (!process.env.DEEPSEEK_API_KEY) return json(res, 200, { mode: 'demo', card: distillDemo({ name, description, dialogue }) });
      const card = await modelJson({
        name: 'character_card', schema: cardSchema,
        instructions: '你是角色设计分析器。只根据用户提供的素材提炼可用于日程陪伴应用的角色卡。backstory 概括明确提供的身世、经历和关系；lore 中每条是角色自己的具体背景事实，quote 必须从输入逐字引用，缺少依据就留空。不编造原作设定、经历或口头禅。appearance 只写有原文依据的外貌特征，否则为空数组。evidence.quote 必须是素材中出现的原文短句；没有证据则返回空数组。sampleLines 为四种情境：发布任务、开始专注、任务完成、暂时没完成。每句不超过60字。用中文输出。',
        input: JSON.stringify({ name, description, dialogue }),
        maxOutputTokens: 3500,
      });
      if (!Array.isArray(card.evidence) || !Array.isArray(card.sampleLines) || !Array.isArray(card.traits) || !Array.isArray(card.appearance)) throw new Error('模型返回的角色卡不完整');
      card.name = name;
      card.evidence = card.evidence.filter((item) => `${description}\n${dialogue}`.includes(item.quote));
      card.backstory = String(card.backstory || description).slice(0, 1200);
      card.lore = verifiedLore(card.lore, `${description}\n${dialogue}`, 96);
      return json(res, 200, { mode: 'ai', card });
    }
    if (path === '/api/line' && req.method === 'POST') {
      const input = await body(req);
      const character = input.character || {};
      const scene = String(input.scene || 'announce').slice(0, 30);
      const taskTitle = String(input.taskTitle || '').slice(0, 80);
      if (!process.env.DEEPSEEK_API_KEY) return json(res, 200, { mode: 'demo', line: demoLine({ character, scene, taskTitle }) });
      const result = await modelJson({
        name: 'character_line',
        schema: { type: 'object', additionalProperties: false, required: ['line'], properties: { line: { type: 'string' } } },
        instructions: '你要按角色卡写一句自然简短的中文对白，用于日程应用。只输出 line。不得编造时间、地点、章节或角色经历；不得宣称用户已完成任务。最多60字。如果 scene 是 reminder，必须完整提及 taskTitle，并像角色主动发来的提醒。如果 scene 是 accepted，可以说已经把用户确认的计划记下。其他任务事实由应用界面单独展示。',
        input: JSON.stringify({ character, scene, taskTitle }),
      });
      if (typeof result.line !== 'string' || !result.line.trim()) throw new Error('模型没有返回角色台词');
      const line = String(result.line).slice(0, 120);
      return json(res, 200, { mode: 'ai', line: scene === 'reminder' && !line.includes(taskTitle) ? demoLine({ character, scene, taskTitle }) : line });
    }
    if (path === '/api/plan' && req.method === 'POST') {
      const input = await body(req, 250000);
      const message = String(input.message || '').trim().slice(0, 2000);
      const localNow = String(input.localNow || '').slice(0, 16);
      const character = input.character || {};
      const roleMemory = { ...character, lore: selectRelevantLore(character.lore, message, 16) };
      const existingPlan = input.existingPlan || null;
      const context = input.context || {};
      if (!message) return json(res, 400, { error: '先告诉角色你想做什么' });
      if (!process.env.DEEPSEEK_API_KEY) return json(res, 200, { mode: 'demo', plan: planDemo({ message, localNow, existingPlan }) });
      const plan = await modelJson({
        name: 'daily_plan', schema: planSchema,
        instructions: `你是日程应用中的角色伙伴，也可以正常聊天。首先理解并直接回应用户当前这句话；不要无缘无故把话题拉回日程。用户若在提问、打招呼、表达情绪或闲聊，就自然回答问题或接话，items 必须是空数组；不能反复问“今天想做什么”。如果用户抱怨你没有听懂，承认刚才没有回应到重点并回答当前问题。只有被问及能否听到声音时，才说明自己看到了文字消息；其他问题直接回答，不以“我看到了你的消息”开头。character.backstory 和 character.lore 是角色自身的背景记忆，lore 每条有原文引句作依据。用户问角色的过去、身份、关系、世界时，优先根据相关记忆以角色第一人称自然回答，不要说“上线前”“模型记忆”“没有可查的记忆”等跳出角色的话；即使用户用了“上线前”，也要理解为问角色在故事里的过去；不要复述“上线前”“地球上线”这类软件术语，开头先回答具体经历。缺少依据的细节要自然承认不知道，不能编造。不要引用 quote 给用户，除非用户要求原文。每次回复把 traits、voice、sampleLines 作为表达方式依据，节奏和用词稳定；不要机械复读口头禅。参考最近对话保持连续性。只有用户明确提出创建或修改日程任务时才生成 items。任务事实必须来自用户消息、现有计划或对话上下文。解析随口说的任务、开始时间与修改意见，给出可编辑的计划草案。参考 upcoming 避免时间冲突，但不要擅自修改已确认的任务。不得擅自添加章节、作业、地点等具体内容。时间字段使用用户当地格式 YYYY-MM-DDTHH:mm，不含时区；现在当地时间由 localNow 给出。如果七点等时间有歧义，做合理假设并在 reply 中明确说明。不能安排到过去；若指定时间已过去，顺延到次日并说明。未指定时长时每项先按 45 分钟、任务间隔 10 分钟。默认提前 15 分钟提醒。若传入 existingPlan 且用户明确要求修改，按修改意见修订，保留未修改项目。每个项目 id 唯一。reply 以角色口吻自然回答，简短、真实；生成计划时说明这是草案，需要用户确认，不能声称已创建日程或设置提醒。`,
        input: JSON.stringify({ message, localNow, character: roleMemory, existingPlan, context }),
      });
      if (typeof plan.reply !== 'string' || !Array.isArray(plan.items)) throw new Error('模型返回的计划不完整');
      plan.items = plan.items.slice(0, 8).filter((item) =>
        item.title && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.startLocal) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.remindLocal) &&
        !Number.isNaN(new Date(item.startLocal).getTime()) && item.startLocal > localNow &&
        item.durationMinutes >= 5 && item.durationMinutes <= 240);
      return json(res, 200, { mode: 'ai', plan });
    }
    if (path.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (path === '/install.apk') {
      try {
        const apk = await readFile(join(root, 'release', 'little-quest-v0.1.2-local-server.apk'));
        res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="little-quest-v0.1.2-local-server.apk"', 'Content-Length': apk.length });
        return res.end(apk);
      } catch { return json(res, 404, { error: '本机安装包尚未构建' }); }
    }
    return serveFile(res, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    json(res, message.includes('模型请求失败') ? 502 : 400, { error: message });
  }
});

const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`Little Quest API: http://${host}:${port}`));
