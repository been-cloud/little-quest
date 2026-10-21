import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8788';
const source = '林岚曾在海边的灯塔守夜。每逢暴风雨，她会点亮顶层的灯，为渔船指路。阿河是她从小一起长大的朋友，两人曾救过一位迷路的渔夫。后来，林岚离开灯塔来到晨光村，仍习惯在傍晚检查每一盏灯。';
const post = async (path, value) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
};

const { id } = await post('/api/distill/jobs', { name: '林岚', description: '', dialogue: '', text: source });
let job;
for (let attempt = 0; attempt < 120; attempt++) {
  job = await (await fetch(`${base}/api/distill/jobs/${id}`)).json();
  if (job.status === 'done' || job.status === 'error') break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(job.status, 'done', job.error || 'distillation timed out');
assert.equal(job.mode, 'ai');
assert.ok(job.card.lore?.length > 0, 'AI did not preserve background memories');
assert.ok(job.card.lore.every((item) => source.includes(item.quote)), 'memory quote not found in source');
assert.ok(job.card.lore.some((item) => /灯塔/.test(item.fact)), 'lighthouse history missing');

const result = await post('/api/plan', {
  message: '你还记得上线前在海边做什么吗？', localNow: '2026-10-21T20:00', character: job.card,
  existingPlan: null, context: { messages: [], upcoming: [] },
});
assert.equal(result.mode, 'ai');
assert.deepEqual(result.plan.items, []);
assert.match(result.plan.reply, /灯塔|守夜|渔船|点灯/);
assert.doesNotMatch(result.plan.reply, /没有可查的记忆|模型记忆/);
console.log(JSON.stringify({ memories: job.card.lore.length, reply: result.plan.reply }));
