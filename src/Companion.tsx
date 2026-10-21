import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Bell, Check, Clock3, MessageCircle, Pencil, Send, Sparkles, X } from 'lucide-react';
import type { Character, ChatMessage, PlanItem, PlanProposal } from './types';

interface Props {
  character: Character;
  messages: ChatMessage[];
  pendingPlan: PlanProposal | null;
  busy: boolean;
  onSend: (message: string) => Promise<void>;
  onEdit: (id: string, field: keyof PlanItem, value: string | number) => void;
  onAccept: () => Promise<void>;
  onDiscard: () => void;
  onOpenForge: () => void;
}

export default function Companion({ character, messages, pendingPlan, busy, onSend, onEdit, onAccept, onDiscard, onOpenForge }: Props) {
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }); }, [messages.length, pendingPlan?.id]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    void onSend(message);
  }

  return <section className="companion-layout">
    <div className="conversation-card">
      <div className="conversation-head"><div className="chat-avatar">{character.avatar ? <img src={character.avatar} alt="" /> : <span>✦</span>}</div><div><h2>{character.name} <span className="online-dot" /></h2><p>{character.lore?.length ? `已记住 ${character.lore.length} 条角色背景 · 想聊什么都可以` : '还没有角色背景记忆 · 可在工坊补全'}</p></div><button className="chat-role-edit" onClick={onOpenForge} title="编辑角色记忆"><Pencil size={16} /></button></div>
      <div className="conversation-body">
        <div className="chat-day-divider"><span>今天</span></div>
        {messages.map((message) => <div className={`message-row ${message.role}`} key={message.id}>
          {message.role === 'character' && <div className="message-avatar">{character.avatar ? <img src={character.avatar} alt="" /> : <span>✦</span>}</div>}
          <div className="message-bubble"><p>{message.text}</p><time>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</time></div>
        </div>)}
        {messages.length <= 1 && !pendingPlan && <div className="chat-starters"><span>像和朋友说话一样，随便聊：</span><button onClick={() => void onSend('今天有点烦，陪我聊聊。')}>今天有点烦，陪我聊聊 <ArrowRight size={14} /></button><button onClick={() => void onSend('我今天要学习数据结构，我还要学Java，我七点才能开始。')}>今天要学数据结构和 Java，七点才能开始 <ArrowRight size={14} /></button></div>}
        {busy && <div className="message-row character"><div className="message-avatar">✦</div><div className="message-bubble thinking"><span /><span /><span /></div></div>}
        {pendingPlan && <div className="plan-card"><div className="plan-card-header"><div><span className="plan-kicker"><Sparkles size={15} /> {pendingPlan.mode === 'ai' ? 'AI 规划' : '演示规划'} · 等你确认</span><h3>我帮你排好了</h3></div><button onClick={onDiscard} aria-label="取消这份计划"><X size={17} /></button></div>
          {pendingPlan.items.map((item, index) => <div className="plan-item" key={item.id}><span className="plan-index">{String(index + 1).padStart(2, '0')}</span><div className="plan-item-main">
            {editing ? <><input aria-label={`第${index + 1}项任务名称`} value={item.title} onChange={(event) => onEdit(item.id, 'title', event.target.value)} /><div className="plan-edit-grid"><label>开始<input type="datetime-local" value={item.startLocal} onChange={(event) => onEdit(item.id, 'startLocal', event.target.value)} /></label><label>提醒<input type="datetime-local" value={item.remindLocal} onChange={(event) => onEdit(item.id, 'remindLocal', event.target.value)} /></label><label>分钟<input type="number" min="5" max="240" value={item.durationMinutes} onChange={(event) => onEdit(item.id, 'durationMinutes', Number(event.target.value))} /></label></div></> : <><b>{item.title}</b><p><Clock3 size={13} /> {item.startLocal.slice(5).replace('T', ' ')} 开始 · {item.durationMinutes} 分钟</p><p><Bell size={13} /> {item.remindLocal.slice(5).replace('T', ' ')} 提醒</p></>}
          </div></div>)}
          <div className="plan-actions"><button className="plan-edit" onClick={() => setEditing(!editing)}><Pencil size={15} />{editing ? '改好了' : '我想改改'}</button><button className="plan-accept" onClick={() => void onAccept()} disabled={busy}><Check size={17} />就这样安排</button></div>
          <p className="plan-note">确认后才会加入任务；你也可以直接发消息让角色修改计划。</p>
        </div>}
        <div ref={endRef} />
      </div>
      <div className="conversation-compose"><form onSubmit={submit}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={`和${character.name}聊聊，或者说说今天的安排……`} rows={2} /><button type="submit" disabled={!input.trim() || busy} aria-label="发送消息"><Send size={19} /></button></form><span>闲聊会按角色的说话方式回复；说出计划时才会生成任务草案。</span></div>
    </div>
    <aside className="companion-aside"><div className="companion-aside-top"><div className="companion-pixel">✦</div><span className="eyebrow">A LITTLE COMPANION</span><h2>有事说事，<br />没事也能聊。</h2><p>{character.name} 会按自己的性格回应你的话。需要安排日程时，也可以直接交给 TA 整理。</p></div><div className="suggestions"><span>试着这样说</span>{['今天心情不太好，想跟你说说。', '我今天要学习数据结构，我还要学Java，我七点才能开始。', '我想把第一项任务改到八点半。'].map((example) => <button key={example} disabled={busy} onClick={() => void onSend(example)}><MessageCircle size={15} />{example}<ArrowRight size={14} /></button>)}</div><div className="companion-privacy"><Bell size={17} /><p>确认计划后才会设置提醒。网页版需保持页面打开；原生版可使用手机系统通知。</p></div></aside>
  </section>;
}
