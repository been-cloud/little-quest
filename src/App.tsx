import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  ArrowRight, Bell, BookOpen, Check, ChevronRight, Clock3, Gift, Leaf, MessageCircle,
  Pause, Play, Plus, RotateCcw, Sparkles, Star, Sun, Timer, Trash2,
  Upload, WandSparkles, X, UserRound,
} from 'lucide-react';
import AccountPanel from './AccountPanel';
import { clearSessionToken, currentAccount, getCloudSnapshot, getSessionToken, loginAccount, logoutAccount, putCloudSnapshot, registerAccount, requestEmailCode, setSessionToken } from './accountApi';
import { characterLine, distill, distillText, getStatus, planDay } from './api';
import Companion from './Companion';
import { dateInputValue, formatTime, initialData, isToday, loadData, saveData } from './data';
import { pixelateImage } from './pixel';
import { cancelQuestReminder, nativeRemindersAvailable, requestReminderPermission, scheduleQuestReminder } from './reminders';
import type { AppData, Character, CharacterCard, PlanItem, Quest, Scene } from './types';
import type { AccountUser } from './accountApi';

type Tab = 'chat' | 'today' | 'focus' | 'forge' | 'journal';
type Category = Quest['category'];

const categories: Category[] = ['学习', '工作', '生活', '其他'];
const presets = [15, 25, 45];

function uid() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function Avatar({ character, size = 'large' }: { character: Character | CharacterCard & { avatar?: string }; size?: 'small' | 'large' }) {
  return <div className={`avatar avatar-${size}`}>
    {character.avatar ? <img src={character.avatar} alt={`${character.name}的像素头像`} /> :
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-label="小禾的像素头像" role="img">
        <rect width="16" height="16" fill="#a9d7c1" />
        <rect x="2" y="11" width="12" height="5" fill="#486d5c" />
        <rect x="4" y="3" width="8" height="9" fill="#5b402f" />
        <rect x="3" y="4" width="10" height="5" fill="#6c4b35" />
        <rect x="5" y="6" width="6" height="7" fill="#f4cba1" />
        <rect x="4" y="2" width="8" height="3" fill="#8b633e" />
        <rect x="3" y="4" width="10" height="1" fill="#a77a47" />
        <rect x="6" y="8" width="1" height="1" fill="#33413a" />
        <rect x="9" y="8" width="1" height="1" fill="#33413a" />
        <rect x="7" y="10" width="2" height="1" fill="#cf8c77" />
        <rect x="4" y="12" width="8" height="4" fill="#d99775" />
        <rect x="7" y="12" width="2" height="4" fill="#f6e6c2" />
        <rect x="12" y="1" width="2" height="2" fill="#e8b956" />
      </svg>}
  </div>;
}

function fallbackLine(character: Character, scene: Scene, title: string) {
  if (scene === 'complete') return `「${title}」完成啦。你的努力，我都看见了！`;
  if (scene === 'start') return character.sampleLines.find((item) => item.scene === '开始专注')?.line || '一起专注一会儿吧。';
  if (scene === 'reminder') return `别忘了「${title}」哦。我们约好的时间快到了。`;
  if (scene === 'accepted') return `好，我把「${title}」记下了。到时候提醒你。`;
  return character.sampleLines.find((item) => item.scene === '发布任务')?.line || `新任务「${title}」已经准备好了。`;
}

function categoryFor(title: string): Category {
  if (/学|复习|课|考试|阅读|练习|Java|数据结构/i.test(title)) return '学习';
  if (/工作|项目|报告|会议|邮件|客户/.test(title)) return '工作';
  if (/家|饭|运动|休息|购物|打扫/.test(title)) return '生活';
  return '其他';
}

function conversationContext(messages: AppData['messages'], query: string) {
  const recentStart = Math.max(0, messages.length - 8);
  const grams = new Set([...query.toLowerCase()].map((_, index) => query.toLowerCase().slice(index, index + 2)).filter((item) => item.length === 2));
  const older = messages.slice(0, recentStart).map((item, index) => ({ index,
    score: [...grams].reduce((score, gram) => score + (item.text.toLowerCase().includes(gram) ? 1 : 0), 0) }))
    .filter((item) => item.score >= 2).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, 6);
  const selected = new Set([...older.map((item) => item.index), ...messages.slice(recentStart).map((_, index) => recentStart + index)]);
  return messages.filter((_, index) => selected.has(index)).map((item) => ({ role: item.role, text: item.text.slice(0, 1000) }));
}

export default function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState('仅保存在本机');
  const [cloudReady, setCloudReady] = useState(false);
  const cloudRevision = useRef(0);
  const lastSynced = useRef('');
  const syncChain = useRef<Promise<void>>(Promise.resolve());
  const [tab, setTab] = useState<Tab>('chat');
  const [chatBusy, setChatBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');
  const [apiMode, setApiMode] = useState<'ai' | 'demo' | 'offline'>('offline');
  const [form, setForm] = useState<{ title: string; note: string; dueAt: string; category: Category }>({
    title: '', note: '', dueAt: dateInputValue(new Date(Date.now() + 3600000)), category: '生活',
  });
  const [source, setSource] = useState({ name: '', description: '', dialogue: '' });
  const [sourceFile, setSourceFile] = useState<{ name: string; text: string } | null>(null);
  const [distillProgress, setDistillProgress] = useState('');
  const [sourceStats, setSourceStats] = useState('');
  const [draft, setDraft] = useState<CharacterCard | null>(null);
  const [profileEdits, setProfileEdits] = useState({ description: '', backstory: '', lore: '', traits: '', voice: '', appearance: '' });
  const [draftMode, setDraftMode] = useState<'demo' | 'ai'>('demo');
  const [draftAvatar, setDraftAvatar] = useState<string | undefined>();
  const [distilling, setDistilling] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => saveData(data), [data]);
  useEffect(() => { getStatus().then((status) => setApiMode(status.mode)).catch(() => setApiMode('demo')); }, []);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) return;
    let active = true;
    void (async () => {
      try {
        const result = await currentAccount(token);
        if (active) await attachCloud(result.user, token, data);
      } catch (error) {
        if (active) setSyncStatus(error instanceof Error ? `云端暂不可用：${error.message}` : '云端暂不可用');
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!account || !cloudReady) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSynced.current) return;
    setSyncStatus('等待同步…');
    const timer = setTimeout(() => {
      const token = getSessionToken();
      syncChain.current = syncChain.current.then(async () => {
        if (!token || token !== getSessionToken() || serialized === lastSynced.current) return;
        setSyncStatus('正在同步…');
        try {
          const result = await putCloudSnapshot(cloudRevision.current, JSON.parse(serialized) as AppData, token);
          cloudRevision.current = result.revision;
          lastSynced.current = serialized;
          setSyncStatus('已同步到账号');
        } catch (error) {
          const message = error instanceof Error ? error.message : '同步失败';
          setSyncStatus(`${message}；本机数据仍保留`);
          if (message.includes('同步冲突')) setCloudReady(false);
        }
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [data, account, cloudReady]);

  async function attachCloud(user: AccountUser, token: string, local: AppData) {
    const snapshot = await getCloudSnapshot(token);
    let next = snapshot.data;
    let revision = snapshot.revision;
    if (!next) {
      const owner = localStorage.getItem('little-quest-data-owner-v1');
      next = owner && owner !== user.id ? initialData() : local;
      revision = (await putCloudSnapshot(revision, next, token)).revision;
    }
    cloudRevision.current = revision;
    lastSynced.current = JSON.stringify(next);
    localStorage.setItem('little-quest-data-owner-v1', user.id);
    setSessionToken(token);
    setData(next);
    setAccount(user);
    setCloudReady(true);
    setSyncStatus('已同步到账号');
  }

  async function submitAccount(action: () => Promise<{ user: AccountUser; token: string }>) {
    setAccountBusy(true);
    try { const session = await action(); await attachCloud(session.user, session.token, data); flash(`已登录 ${session.user.email}`); }
    finally { setAccountBusy(false); }
  }

  async function signOut() {
    setAccountBusy(true);
    try {
      await syncChain.current;
      if (syncStatus.includes('冲突') || syncStatus.includes('失败')) throw new Error('数据尚未同步，请先处理同步问题');
      await logoutAccount();
      clearSessionToken();
      localStorage.removeItem('little-quest-data-owner-v1');
      setCloudReady(false);
      setAccount(null);
      setData(initialData());
      setSyncStatus('仅保存在本机');
    } finally { setAccountBusy(false); }
  }

  function flash(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  }

  useEffect(() => {
    if (!running || endAt === null) return;
    let finished = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !finished) {
        finished = true;
        setRunning(false);
        setEndAt(null);
        setData((current) => ({
          ...current,
          coins: current.coins + 5,
          sessions: [{ id: uid(), taskId: selectedTaskId, minutes: focusMinutes, completedAt: new Date().toISOString() }, ...current.sessions],
        }));
        flash('专注完成！获得 5 枚星币 ✦');
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [running, endAt, selectedTaskId, focusMinutes]);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due = data.quests.filter((quest) => !quest.done && !quest.reminded && !quest.id.startsWith('sample-') && (quest.remindAt || quest.dueAt) &&
        new Date(quest.remindAt || quest.dueAt).getTime() <= now && new Date(quest.remindAt || quest.dueAt).getTime() > now - 86400000);
      if (!due.length) return;
      due.forEach((quest) => {
        if (!nativeRemindersAvailable() && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(`来自${data.character.name}的提醒`, { body: quest.reminderLine || `别忘了「${quest.title}」哦。`, icon: '/icon.svg' });
        }
      });
      flash(`${data.character.name} 发来了 ${due.length} 条提醒`);
      setData((current) => ({ ...current,
        quests: current.quests.map((quest) => due.some((item) => item.id === quest.id) ? { ...quest, reminded: true } : quest),
        messages: [...current.messages, ...due.map((quest) => ({ id: uid(), role: 'character' as const, text: quest.reminderLine || `别忘了「${quest.title}」哦。`, createdAt: new Date().toISOString() }))],
      }));
    };
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [data.quests, data.character.name]);

  const todayQuests = data.quests.filter((quest) => isToday(quest.dueAt));
  const upcomingQuests = data.quests.filter((quest) => !isToday(quest.dueAt) && !quest.done);
  const completedToday = todayQuests.filter((quest) => quest.done).length;
  const progress = todayQuests.length ? Math.round(completedToday / todayQuests.length * 100) : 0;
  const selectedTask = data.quests.find((quest) => quest.id === selectedTaskId);
  const todaySessions = data.sessions.filter((session) => isToday(session.completedAt));
  const dateText = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

  async function makeLine(character: Character, scene: Scene, title: string): Promise<string> {
    try { return (await characterLine({ character, scene, taskTitle: title })).line; }
    catch { return fallbackLine(character, scene, title); }
  }

  async function sendChat(message: string) {
    const sentAt = new Date().toISOString();
    setData((current) => ({ ...current, messages: [...current.messages, { id: uid(), role: 'user', text: message, createdAt: sentAt }] }));
    setChatBusy(true);
    try {
      const result = await planDay({ message, localNow: dateInputValue(), character: data.character,
        existingPlan: data.pendingPlan ? { items: data.pendingPlan.items } : null,
        context: { messages: conversationContext(data.messages, message),
          upcoming: data.quests.filter((quest) => !quest.done && quest.dueAt && new Date(quest.dueAt) > new Date())
            .slice(0, 12).map((quest) => ({ title: quest.title, startLocal: dateInputValue(new Date(quest.dueAt)), durationMinutes: quest.durationMinutes || 45 })) },
      });
      if (apiMode === 'ai' && result.mode === 'demo') flash('AI 暂不可用，已使用演示规划');
      setData((current) => ({ ...current,
        messages: [...current.messages, { id: uid(), role: 'character', text: result.plan.reply, createdAt: new Date().toISOString() }],
        pendingPlan: result.plan.items.length ? { id: uid(), reply: result.plan.reply, items: result.plan.items, mode: result.mode } : current.pendingPlan,
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : '请求失败';
      setData((current) => ({ ...current, messages: [...current.messages, { id: uid(), role: 'character', text: `我看到你的消息了，但这次回复失败：${reason}。请再试一次。`, createdAt: new Date().toISOString() }] }));
    } finally { setChatBusy(false); }
  }

  function editPlanItem(id: string, field: keyof PlanItem, value: string | number) {
    setData((current) => current.pendingPlan ? ({ ...current, pendingPlan: {
      ...current.pendingPlan,
      items: current.pendingPlan.items.map((item) => item.id === id ? { ...item, [field]: value } : item),
    } }) : current);
  }

  function discardPlan() {
    setData((current) => ({ ...current, pendingPlan: null }));
    flash('这份草案已取消，随时可以重新说');
  }

  async function acceptPlan() {
    const proposal = data.pendingPlan;
    if (!proposal || chatBusy) return;
    const now = Date.now();
    for (const item of proposal.items) {
      const start = new Date(item.startLocal).getTime();
      const remind = new Date(item.remindLocal).getTime();
      if (!item.title.trim() || !Number.isFinite(start) || start <= now || !Number.isFinite(remind) || remind > start || item.durationMinutes < 5 || item.durationMinutes > 240) {
        flash('请检查任务名称、未来的开始时间和提醒时间');
        return;
      }
    }
    setChatBusy(true);
    const reminderAllowed = await requestReminderPermission().catch(() => false);
    const character = data.character;
    try {
      const quests = await Promise.all(proposal.items.map(async (item): Promise<Quest> => {
        const reminderLine = await makeLine(character, 'reminder', item.title.trim());
        const startAt = new Date(item.startLocal).toISOString();
        const proposedReminder = new Date(item.remindLocal).getTime();
        const safeReminder = proposedReminder <= Date.now() && new Date(item.startLocal).getTime() > Date.now() + 60000
          ? new Date(Date.now() + 60000).toISOString() : new Date(item.remindLocal).toISOString();
        return { id: uid(), title: item.title.trim(), note: item.note.trim(), dueAt: startAt,
          remindAt: safeReminder, durationMinutes: item.durationMinutes,
          category: categoryFor(item.title), done: false, createdAt: new Date().toISOString(), reminderLine,
          questLine: fallbackLine(character, 'announce', item.title.trim()) };
      }));
      const acceptedLine = await makeLine(character, 'accepted', quests.map((quest) => quest.title).join('、'));
      setData((current) => ({ ...current, quests: [...quests, ...current.quests], pendingPlan: null,
        messages: [...current.messages, { id: uid(), role: 'character', text: acceptedLine, createdAt: new Date().toISOString() }],
      }));
      if (nativeRemindersAvailable() && reminderAllowed) {
        await Promise.all(quests.map((quest) => scheduleQuestReminder(quest, character).catch(() => false)));
        flash('计划已记下，手机提醒已设置');
      } else if (reminderAllowed) {
        flash('计划已记下；网页版打开时会提醒你');
      } else {
        flash('计划已记下；提醒权限尚未开启');
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : '保存计划时出错');
    } finally { setChatBusy(false); }
  }

  function addQuest(event: FormEvent) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return flash('先写下任务名称');
    const quest: Quest = {
      id: uid(), title, note: form.note.trim(), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : '',
      remindAt: form.dueAt ? new Date(form.dueAt).toISOString() : '', reminderLine: fallbackLine(data.character, 'reminder', title),
      category: form.category, done: false, createdAt: new Date().toISOString(),
      questLine: fallbackLine(data.character, 'announce', title),
    };
    setData((current) => ({ ...current, quests: [quest, ...current.quests] }));
    setShowAdd(false);
    setForm({ title: '', note: '', dueAt: dateInputValue(new Date(Date.now() + 3600000)), category: '生活' });
    flash('新任务已写上公告板');
    void scheduleQuestReminder(quest, data.character).catch(() => {});
    makeLine(data.character, 'announce', title).then((line) => {
      setData((current) => ({ ...current, quests: current.quests.map((item) => item.id === quest.id ? { ...item, questLine: line } : item) }));
    });
  }

  function toggleQuest(quest: Quest) {
    const nextDone = !quest.done;
    setData((current) => ({
      ...current,
      coins: Math.max(0, current.coins + (nextDone ? 10 : -10)),
      quests: current.quests.map((item) => item.id === quest.id ? { ...item, done: nextDone, completedAt: nextDone ? new Date().toISOString() : undefined } : item),
    }));
    flash(nextDone ? '任务完成！获得 10 枚星币 ✦' : '任务已恢复');
    if (nextDone) void cancelQuestReminder(quest.id).catch(() => {});
    else void scheduleQuestReminder(quest, data.character).catch(() => {});
    if (nextDone) makeLine(data.character, 'complete', quest.title).then((line) => {
      setData((current) => ({ ...current, quests: current.quests.map((item) => item.id === quest.id ? { ...item, questLine: line } : item) }));
    });
  }

  function deleteQuest(id: string) {
    void cancelQuestReminder(id).catch(() => {});
    setData((current) => ({ ...current, quests: current.quests.filter((item) => item.id !== id) }));
    if (selectedTaskId === id) setSelectedTaskId(undefined);
    flash('任务已移除');
  }

  function beginFocus() {
    if (remaining <= 0) setRemaining(focusMinutes * 60);
    const seconds = remaining <= 0 ? focusMinutes * 60 : remaining;
    setEndAt(Date.now() + seconds * 1000);
    setRunning(true);
  }

  function pauseFocus() {
    if (endAt !== null) setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    setRunning(false);
    setEndAt(null);
  }

  function resetFocus() {
    setRunning(false);
    setEndAt(null);
    setRemaining(focusMinutes * 60);
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setDraftAvatar(await pixelateImage(file)); flash('像素头像生成好了'); }
    catch (error) { flash(error instanceof Error ? error.message : '图片处理失败'); }
  }

  async function uploadText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.txt$/i.test(file.name)) { flash('请选择 .txt 文本文件'); return; }
    if (file.size > 20000000) { flash('TXT 文件最大 20 MB'); return; }
    const bytes = await file.arrayBuffer();
    let value = new TextDecoder('utf-8').decode(bytes);
    if ((value.match(/�/g) || []).length > Math.max(3, value.length * .002)) value = new TextDecoder('gb18030').decode(bytes);
    const text = value.replace(/^\uFEFF/, '');
    if (!text.trim()) { flash('TXT 文件为空'); return; }
    setSourceFile({ name: file.name, text });
    setSourceStats('');
    flash(`已读取 ${file.name}`);
  }

  async function runDistill(event: FormEvent) {
    event.preventDefault();
    setDistilling(true);
    try {
      setDistillProgress(sourceFile ? '正在准备文本分析…' : '正在整理角色卡…');
      const result = sourceFile ? await distillText({ ...source, text: sourceFile.text }, (done, total) =>
        setDistillProgress(`正在分析文本 ${done}/${total} 步`)) : await distill(source);
      const sameRole = data.character.name.trim() === result.card.name.trim();
      const lore = sameRole ? [...(data.character.lore || []), ...(result.card.lore || [])] : (result.card.lore || []);
      const nextCard = { ...result.card, backstory: result.card.backstory || (sameRole ? data.character.backstory : '') || '',
        lore: lore.filter((item, index) => lore.findIndex((other) => other.fact === item.fact) === index).slice(0, 96) };
      setDraft(nextCard);
      setProfileEdits({ description: nextCard.description, backstory: nextCard.backstory, lore: nextCard.lore.map((item) => item.fact).join('\n'), traits: nextCard.traits.join('\n'),
        voice: nextCard.voice.join('\n'), appearance: (nextCard.appearance || []).join('\n') });
      setDraftMode(result.mode);
      if ('stats' in result && result.stats) {
        const stats = result.stats as { sourceChars: number; excerpts: number; mentions: number; analyzedChars: number };
        setSourceStats(`共 ${stats.sourceChars.toLocaleString()} 字，分析片段 ${stats.excerpts} 段，角色名出现 ${stats.mentions} 次。已分析约 ${stats.analyzedChars.toLocaleString()} 字，可核对下方原文证据。`);
      } else setSourceStats('');
      flash(result.mode === 'ai' ? '角色蒸馏完成，看看像不像' : '演示角色卡已生成；配置 API Key 可启用 AI 蒸馏');
    } catch (error) {
      flash(error instanceof Error ? error.message : '蒸馏失败');
    } finally { setDistilling(false); setDistillProgress(''); }
  }

  function saveCharacter() {
    if (!draft) return;
    const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
    const sameRole = data.character.name.trim() === draft.name.trim();
    const character: Character = { ...draft, description: profileEdits.description.trim(), backstory: profileEdits.backstory.trim(),
      lore: lines(profileEdits.lore).slice(0, 96).map((fact) => draft.lore?.find((item) => item.fact === fact) || { kind: '手动补充', fact, quote: '' }),
      traits: lines(profileEdits.traits), voice: lines(profileEdits.voice), appearance: lines(profileEdits.appearance),
      id: sameRole ? data.character.id : uid(), avatar: draftAvatar || (sameRole ? data.character.avatar : undefined), mode: draftMode };
    setData((current) => ({ ...current, character, pendingPlan: null,
      messages: sameRole ? current.messages : [{ id: uid(), role: 'character', text: `你好，我是${character.name}。你想聊什么？有日程需要我记住，也可以直接告诉我。`, createdAt: new Date().toISOString() }],
      quests: current.quests.map((quest) => quest.done ? quest : { ...quest,
        questLine: fallbackLine(character, 'announce', quest.title), reminderLine: fallbackLine(character, 'reminder', quest.title) }),
    }));
    if (nativeRemindersAvailable()) {
      data.quests.filter((quest) => !quest.done && quest.remindAt && new Date(quest.remindAt) > new Date()).forEach((quest) => {
        void cancelQuestReminder(quest.id).then(() => scheduleQuestReminder({ ...quest,
          reminderLine: fallbackLine(character, 'reminder', quest.title) }, character)).catch(() => {});
      });
    }
    setDraft(null);
    setTab('chat');
    flash(sameRole ? `${character.name}的背景记忆已更新，聊天记录已保留` : `${character.name}已成为你的任务伙伴`);
  }

  async function enableNotifications() {
    const allowed = await requestReminderPermission().catch(() => false);
    flash(allowed ? nativeRemindersAvailable() ? '手机提醒已开启' : '提醒已开启；页面打开时会通知你' : '没有获得通知权限');
  }

  const questCard = (quest: Quest) => <article className={`quest-card ${quest.done ? 'is-done' : ''}`} key={quest.id}>
    <button className="quest-check" aria-label={quest.done ? `恢复${quest.title}` : `完成${quest.title}`} onClick={() => toggleQuest(quest)}>
      {quest.done && <Check size={17} strokeWidth={3} />}
    </button>
    <div className="quest-copy">
      <div className="quest-topline"><span className={`category category-${quest.category}`}>{quest.category}</span><span className="quest-time"><Clock3 size={13} />{formatTime(quest.dueAt)}</span></div>
      <strong>{quest.title}</strong>
      {quest.note && <p className="quest-note">{quest.note}</p>}
      {quest.questLine && <p className="quest-voice">“{quest.questLine}”</p>}
    </div>
    <div className="quest-actions">
      {!quest.done && <button title="用这项任务开始专注" onClick={() => { setSelectedTaskId(quest.id); setTab('focus'); }}><Play size={16} fill="currentColor" /></button>}
      <button title="删除任务" onClick={() => deleteQuest(quest.id)}><Trash2 size={15} /></button>
    </div>
  </article>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Leaf size={23} /></div><div><b>小小任务</b><span>LITTLE QUEST</span></div></div>
      <div className="side-caption">你的冒险地图</div>
      <nav className="side-nav" aria-label="主导航">
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageCircle size={19} /> 伙伴对话 <ChevronRight size={15} /></button>
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}><Sun size={19} /> 今日任务 <ChevronRight size={15} /></button>
        <button className={tab === 'focus' ? 'active' : ''} onClick={() => setTab('focus')}><Timer size={19} /> 专注小屋 <ChevronRight size={15} /></button>
        <button className={tab === 'forge' ? 'active' : ''} onClick={() => setTab('forge')}><WandSparkles size={19} /> 角色工坊 <ChevronRight size={15} /></button>
        <button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}><BookOpen size={19} /> 冒险手账 <ChevronRight size={15} /></button>
      </nav>
      <div className="sidebar-bottom"><Avatar character={data.character} size="small" /><div><b>{data.character.name}</b><span>{account ? '冒险已连接账号' : '仅保存在本机'}</span></div><Sparkles size={17} /></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-title"><span className="eyebrow">✦ 小小村庄 · 冒险日志 ✦</span><h1>{tab === 'chat' ? `${data.character.name}的小屋` : tab === 'today' ? '村庄公告板' : tab === 'focus' ? '专注小屋' : tab === 'forge' ? '角色工坊' : '冒险手账'}</h1></div><div className="top-actions"><button className="account-trigger" onClick={() => setShowAccount(true)}><UserRound size={16} />{account ? '我的账号' : '注册 / 登录'}</button><span className="date-pill"><Sun size={15} />{dateText}</span><span className="coin-pill"><Star size={16} fill="currentColor" />{data.coins} 星币</span></div></header>

      <div className="content">
        {tab === 'chat' && <Companion character={data.character} messages={data.messages} pendingPlan={data.pendingPlan} busy={chatBusy}
          onSend={sendChat} onEdit={editPlanItem} onAccept={acceptPlan} onDiscard={discardPlan} onOpenForge={() => setTab('forge')} />}
        {tab === 'today' && <>
          <section className="hero-scene">
            <div className="hero-content"><div className="hero-kicker"><span className="pixel-dot" /> 今日委托 · DAY {String(new Date().getDate()).padStart(2, '0')}</div><h2>今天的冒险<br />从这里开始。</h2><p>把想做的事告诉 {data.character.name}，一起写成今天的任务。</p><div className="hero-actions"><button className="primary-button" onClick={() => setTab('chat')}><MessageCircle size={18} /> 找伙伴对话</button><button className="village-link" onClick={() => setTab('focus')}><Timer size={16} /> 去专注小屋</button></div></div>
            <div className="hero-character"><Avatar character={data.character} /><div className="nameplate">✦ {data.character.name} ✦</div></div>
          </section>

          <section className="dashboard-row">
            <div className="stat-card progress-stat"><div className="stat-icon mint"><Check size={22} /></div><div><span>今日进度</span><strong>{completedToday}<small> / {todayQuests.length} 项任务</small></strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>
            <div className="stat-card"><div className="stat-icon peach"><Timer size={22} /></div><div><span>专注时光</span><strong>{todaySessions.reduce((sum, session) => sum + session.minutes, 0)}<small> 分钟</small></strong></div></div>
            <div className="stat-card"><div className="stat-icon yellow"><Star size={22} /></div><div><span>星币收获</span><strong>{data.coins}<small> 枚</small></strong></div></div>
          </section>

          <section className="quests-section"><div className="section-heading"><div><span className="eyebrow">QUEST BOARD</span><h2>今天的任务 <span>{todayQuests.length}</span></h2></div><button className="text-button" onClick={() => setShowAdd(true)}>添加任务 <Plus size={16} /></button></div>
            <div className="quest-list">{todayQuests.length ? todayQuests.map(questCard) : <div className="empty-state"><Leaf size={29} /><b>公告板还是空的</b><span>写下今天想完成的第一件事吧。</span><button onClick={() => setShowAdd(true)}>创建任务 <ArrowRight size={15} /></button></div>}</div>
          </section>
          {upcomingQuests.length > 0 && <section className="quests-section upcoming"><div className="section-heading"><div><span className="eyebrow">COMING SOON</span><h2>接下来的任务 <span>{upcomingQuests.length}</span></h2></div></div><div className="quest-list">{upcomingQuests.map(questCard)}</div></section>}
        </>}

        {tab === 'focus' && <section className="focus-layout">
          <div className="focus-panel"><div className="focus-panel-top"><span className="eyebrow">FOCUS COTTAGE</span><span className="focus-sparkle">✦ ✧ ✦</span></div><div className="focus-avatar"><Avatar character={data.character} /><span>{running ? '正在陪你专注' : '准备好就开始吧'}</span></div>
            <div className="timer-digits">{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div>
            <div className="timer-presets">{presets.map((minutes) => <button key={minutes} disabled={running} className={focusMinutes === minutes ? 'selected' : ''} onClick={() => { setFocusMinutes(minutes); setRemaining(minutes * 60); }}>{minutes} 分钟</button>)}</div>
            <div className="timer-controls"><button className="primary-button" onClick={running ? pauseFocus : beginFocus}>{running ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}{running ? '暂停专注' : remaining < focusMinutes * 60 ? '继续专注' : '开始专注'}</button><button className="square-button" title="重新计时" onClick={resetFocus}><RotateCcw size={20} /></button></div>
            <p className="focus-hint">完成一次专注可获得 5 枚星币</p>
          </div>
          <div className="focus-side"><div className="panel-card"><div className="panel-label"><Leaf size={17} /> 本次冒险任务</div><select value={selectedTaskId || ''} onChange={(event) => setSelectedTaskId(event.target.value || undefined)}><option value="">自由专注</option>{data.quests.filter((quest) => !quest.done).map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select><div className="character-quote"><Avatar character={data.character} size="small" /><p>“{fallbackLine(data.character, 'start', selectedTask?.title || '')}”</p></div></div>
            <div className="panel-card focus-tips"><div className="panel-label"><Sparkles size={17} /> 专注小贴士</div><p>关掉打扰，给自己一段完整的时间。休息时记得喝水、活动一下。</p><div className="little-plants">▁▃▆▃▁ <span>✿</span> ▁▃▆▃▁</div></div></div>
        </section>}

        {tab === 'forge' && <section className="forge-layout">
          <div className="forge-intro"><span className="eyebrow">CHARACTER WORKSHOP</span><h2>把喜欢的角色，<br /><em>带进你的日常。</em></h2><p>上传角色故事，蒸馏器会提炼性格、说话方式和带原文依据的背景记忆。角色会记得自己的过去，也会接着和你的聊天继续说。</p><div className={`mode-badge ${apiMode}`}>{apiMode === 'ai' ? '✦ DeepSeek 已连接' : apiMode === 'demo' ? '◌ 本地演示模式' : '◌ 服务未连接'}</div></div>
          <div className="forge-grid"><form className="panel-card forge-form" onSubmit={runDistill}><div className="panel-title"><span className="step-num">01</span><div><strong>提供角色素材</strong><small>对白越具体，生成的角色越有辨识度</small></div></div>
              {data.character.mode !== 'starter' && <button type="button" className="text-button" onClick={() => { setSource({ name: data.character.name, description: data.character.backstory || data.character.description, dialogue: '' }); setDraftAvatar(data.character.avatar); flash('已载入当前角色；上传原 TXT 可补充背景记忆'); }}>补全当前角色「{data.character.name}」的记忆</button>}
              <label>角色名字<input value={source.name} maxLength={30} onChange={(event) => setSource({ ...source, name: event.target.value })} placeholder="例如：小禾" required /></label>
              <label>性格与背景<textarea value={source.description} maxLength={3000} onChange={(event) => setSource({ ...source, description: event.target.value })} placeholder="描述他是谁、在意什么、遇到困难时会怎么回应……" rows={4} /></label>
              <label>典型对白 <span className="field-hint">每句一行</span><textarea value={source.dialogue} maxLength={12000} onChange={(event) => setSource({ ...source, dialogue: event.target.value })} placeholder={'“先完成眼前这一件事吧。”\n“辛苦了，今天也做得很好。”'} rows={6} /></label>
              <label className="upload-area"><Upload size={22} /><b>{sourceFile ? `已选择：${sourceFile.name}` : '上传长 TXT 提取角色'}</b><small>{sourceFile ? `${sourceFile.text.length.toLocaleString()} 字 · 点击可更换` : '支持 UTF-8 / GB18030，文件最大 20 MB；系统自动选取最多 60 万字分析'}</small><input type="file" accept=".txt,text/plain" onChange={uploadText} /></label>
              {sourceFile && <button type="button" className="text-button" onClick={() => { setSourceFile(null); setSourceStats(''); }}>移除 TXT</button>}
              <label className="upload-area"><Upload size={22} /><b>{draftAvatar ? '像素头像已生成，点击更换' : '上传角色图片，生成像素头像'}</b><small>图片留在本机处理，不会随对白上传</small><input type="file" accept="image/*" onChange={uploadAvatar} /></label>
              {draftAvatar && <div className="avatar-preview"><img src={draftAvatar} alt="生成的像素头像预览" /><span>48 × 48 像素风预览</span></div>}
              <button className="primary-button full" disabled={distilling || apiMode === 'offline'} type="submit"><WandSparkles size={18} />{distilling ? distillProgress : '开始蒸馏角色'}</button>
              <p className="form-note">{apiMode === 'demo' ? '演示模式使用本地规则提取；在服务端 .env 中配置 DEEPSEEK_API_KEY 后启用 AI 蒸馏。' : 'TXT 会发送到 DeepSeek 分段分析；服务端仅临时保留任务结果。'}</p>
            </form>
            <div className="forge-result panel-card"><div className="panel-title"><span className="step-num">02</span><div><strong>试演与校正</strong><small>看看这个角色说话像不像</small></div></div>
              {draft ? <>{sourceStats && <p className="form-note">{sourceStats}</p>}<div className="draft-identity"><Avatar character={{ ...draft, avatar: draftAvatar }} size="small" /><div><b>{draft.name}</b><span>{profileEdits.description}</span></div></div><div className="chip-row">{profileEdits.traits.split('\n').filter(Boolean).map((trait, index) => <span key={`${trait}-${index}`}>{trait}</span>)}</div>
                  <div className="draft-block profile-edit"><strong>校正角色画像 <small>每条性格、语气或外貌线索各占一行</small></strong>
                    <label>角色简介<textarea value={profileEdits.description} rows={3} onChange={(event) => setProfileEdits({ ...profileEdits, description: event.target.value })} /></label>
                    <label>角色的过去与关系<textarea value={profileEdits.backstory} rows={5} placeholder="角色是谁，来自哪里，经历过什么，和谁有重要关系" onChange={(event) => setProfileEdits({ ...profileEdits, backstory: event.target.value })} /></label>
                    <label>背景记忆 <span className="field-hint">每条一行；可改错、补充事实</span><textarea value={profileEdits.lore} rows={8} placeholder="例如：曾经在海边的灯塔工作。" onChange={(event) => setProfileEdits({ ...profileEdits, lore: event.target.value })} /></label>
                    <label>性格<textarea value={profileEdits.traits} rows={3} onChange={(event) => setProfileEdits({ ...profileEdits, traits: event.target.value })} /></label>
                    <label>说话方式<textarea value={profileEdits.voice} rows={3} onChange={(event) => setProfileEdits({ ...profileEdits, voice: event.target.value })} /></label>
                    <label>外貌线索<textarea value={profileEdits.appearance} rows={3} placeholder="仅填素材中有依据的外貌特征" onChange={(event) => setProfileEdits({ ...profileEdits, appearance: event.target.value })} /></label>
                  </div>
                  <div className="draft-block"><strong>情境试演 <small>可直接修改台词</small></strong>{draft.sampleLines.map((sample, index) => <label className="sample-line" key={index}><span>{sample.scene}</span><textarea value={sample.line} rows={2} onChange={(event) => setDraft({ ...draft, sampleLines: draft.sampleLines.map((item, inner) => inner === index ? { ...item, line: event.target.value } : item) })} /></label>)}</div>
                  {!!(draft.lore || []).length && <div className="draft-block evidence"><strong>背景记忆来源 · {draft.lore?.length} 条</strong>{draft.lore?.slice(0, 12).map((item, index) => <p key={index}><b>{item.kind}：</b>{item.fact}<br /><small>“{item.quote || '手动补充'}”</small></p>)}</div>}
                  {!!draft.evidence.length && <div className="draft-block evidence"><strong>说话方式依据</strong>{draft.evidence.map((item, index) => <p key={index}>“{item.quote}”</p>)}</div>}
                  <button className="primary-button full" onClick={saveCharacter}><Check size={18} /> 启用这个角色</button></> : <div className="result-empty"><div className="result-illustration"><WandSparkles size={42} /><span>✦</span></div><b>角色故事还没开始</b><p>左边填写素材后，这里会出现可编辑的角色卡和情境试演。</p></div>}
            </div></div>
        </section>}

        {tab === 'journal' && <section className="journal-layout"><div className="journal-banner"><div><span className="eyebrow">ADVENTURE JOURNAL</span><h2>你的每一步，<br />都有留下痕迹。</h2><p>日子会过去，努力会被记住。</p></div><div className="journal-symbol">✦</div></div><div className="journal-stats"><div><Gift size={24} /><strong>{data.coins}</strong><span>累计星币</span></div><div><Check size={24} /><strong>{data.quests.filter((quest) => quest.done).length}</strong><span>完成任务</span></div><div><Timer size={24} /><strong>{data.sessions.reduce((sum, session) => sum + session.minutes, 0)}</strong><span>专注分钟</span></div></div><div className="panel-card journal-list"><div className="section-heading"><div><span className="eyebrow">MEMORIES</span><h2>最近完成</h2></div></div>{data.quests.filter((quest) => quest.done).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).map((quest) => <div className="journal-item" key={quest.id}><span className="journal-check"><Check size={15} /></span><div><b>{quest.title}</b><small>{quest.completedAt ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(quest.completedAt)) : ''}</small></div><span>+10 ✦</span></div>)}{!data.quests.some((quest) => quest.done) && <div className="empty-state"><BookOpen size={27} /><b>还没有完成记录</b><span>完成第一项任务，就会写下你的冒险故事。</span></div>}</div></section>}
      </div>
    </main>

    <nav className="bottom-nav" aria-label="主导航"><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageCircle size={21} /><span>对话</span></button><button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}><Sun size={21} /><span>任务</span></button><button className={tab === 'focus' ? 'active' : ''} onClick={() => setTab('focus')}><Timer size={21} /><span>专注</span></button><button className={tab === 'forge' ? 'active' : ''} onClick={() => setTab('forge')}><WandSparkles size={21} /><span>角色</span></button><button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}><BookOpen size={21} /><span>手账</span></button></nav>

    {showAdd && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}><form className="add-modal" onSubmit={addQuest}><div className="modal-heading"><div><span className="eyebrow">NEW QUEST</span><h2>发布新任务</h2></div><button type="button" onClick={() => setShowAdd(false)} aria-label="关闭"><X size={21} /></button></div><label>任务名称<input autoFocus value={form.title} maxLength={80} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="今天想完成什么？" required /></label><label>补充说明<textarea rows={3} value={form.note} maxLength={300} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="拆成容易开始的小步骤……" /></label><div className="form-row"><label>类别<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>提醒时间<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label></div><button type="button" className="notification-row" onClick={enableNotifications}><Bell size={17} /><span>开启提醒</span><ChevronRight size={15} /></button><p className="form-note">手机版使用系统通知；网页版需要保持页面打开。</p><button type="submit" className="primary-button full"><Plus size={18} /> 写上公告板</button></form></div>}
    {showAccount && <AccountPanel user={account} syncStatus={syncStatus} busy={accountBusy} onClose={() => setShowAccount(false)}
      onCode={async (email) => { setAccountBusy(true); try { await requestEmailCode(email); } finally { setAccountBusy(false); } }}
      onRegister={(email, code, password) => submitAccount(() => registerAccount(email, code, password))}
      onLogin={(email, password) => submitAccount(() => loginAccount(email, password))} onLogout={signOut} />}
    {toast && <div className="toast" role="status"><Sparkles size={17} />{toast}</div>}
  </div>;
}
