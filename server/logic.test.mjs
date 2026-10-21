import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationDemo, distillDemo, demoLine, planDemo, selectRelevantLore, verifiedLore } from './logic.mjs';
import { selectCharacterExcerpts } from './longText.mjs';

test('demo distillation keeps source evidence and extracts style clues', () => {
  const card = distillDemo({ name: '小禾', description: '温柔的园丁', dialogue: '慢慢来，我会陪着你。\n耶！今天也加油！' });
  assert.equal(card.name, '小禾');
  assert.ok(card.traits.includes('温柔'));
  assert.ok(card.evidence.length > 0);
  assert.ok(card.evidence.every((item) => '慢慢来，我会陪着你。\n耶！今天也加油！'.includes(item.quote)));
});

test('task announcement preserves exact task title', () => {
  const line = demoLine({ character: { name: '小禾' }, scene: 'announce', taskTitle: '复习英语单词' });
  assert.match(line, /复习英语单词/);
});

test('casual Chinese request becomes a reviewable evening plan without invented chapters', () => {
  const plan = planDemo({ message: '我今天要学习数据结构，我还要学java，我七点才能开始。', localNow: '2026-10-21T17:00' });
  assert.equal(plan.items.length, 2);
  assert.match(plan.items[0].title, /数据结构/);
  assert.match(plan.items[1].title.toLowerCase(), /java/);
  assert.equal(plan.items[0].startLocal, '2026-10-21T19:00');
  assert.equal(plan.items[0].remindLocal, '2026-10-21T18:45');
  assert.ok(!JSON.stringify(plan).includes('第四章'));
});

test('a follow-up can revise a proposed task time', () => {
  const first = planDemo({ message: '我今天要学习数据结构，我还要学java，我七点才能开始。', localNow: '2026-10-21T17:00' });
  const revised = planDemo({ message: '把Java改到八点半', localNow: '2026-10-21T17:00', existingPlan: first });
  assert.equal(revised.items[1].startLocal, '2026-10-21T20:30');
  assert.equal(revised.items[0].startLocal, first.items[0].startLocal);
});

test('long TXT selection samples bounded unique windows and tracks character mentions', () => {
  const source = '甲'.repeat(10000) + '唐陌说：“先把眼前的事做好。”' + '乙'.repeat(20000);
  const result = selectCharacterExcerpts(source, '唐陌');
  assert.equal(result.mentions, 1);
  assert.ok(result.excerpts.some((item) => item.text.includes('唐陌说')));
  assert.ok(result.excerpts.length <= 12);
  assert.equal(result.analyzedChars, source.length);
  assert.ok(result.analyzedChars <= result.excerpts.length * 50000);
  assert.equal(new Set(result.excerpts.map((item) => item.start)).size, result.excerpts.length);
});

test('TXT beyond 600k characters is sampled across the full original text', () => {
  const source = '甲'.repeat(900000) + '唐陌说：“先确认这件事。”' + '乙'.repeat(350000);
  const result = selectCharacterExcerpts(source, '唐陌');
  assert.equal(result.sourceChars, source.length);
  assert.ok(result.analyzedChars <= 600000);
  assert.ok(result.excerpts.some((item) => item.text.includes('唐陌说')));
});

test('casual chat responds to the question without creating a task', () => {
  const plan = planDemo({ message: '你他妈的能听见吗', localNow: '2026-10-21T20:12' });
  assert.deepEqual(plan.items, []);
  assert.match(plan.reply, /看到.*消息/);
  assert.doesNotMatch(plan.reply, /今天想做什么/);
  assert.match(conversationDemo('你是谁？'), /伙伴/);
});

test('background memories require an exact source quote and retrieve the relevant past', () => {
  const source = '林岚曾在海边的灯塔守夜。她和阿河一起救过迷路的渔夫。';
  const lore = verifiedLore([
    { kind: '经历', fact: '林岚曾在海边的灯塔守夜。', quote: '林岚曾在海边的灯塔守夜。' },
    { kind: '关系', fact: '林岚和阿河一起救过渔夫。', quote: '她和阿河一起救过迷路的渔夫。' },
    { kind: '经历', fact: '林岚去过月球。', quote: '她去过月球。' },
  ], source);
  assert.equal(lore.length, 2);
  assert.match(selectRelevantLore(lore, '你上线前在海边做过什么？', 1)[0].fact, /灯塔/);
});
