import { useState } from 'react';
import type { FormEvent } from 'react';
import { Cloud, LogIn, LogOut, Mail, X } from 'lucide-react';
import type { AccountUser } from './accountApi';
import { getApiBaseUrl, setApiBaseUrl } from './serverUrl';

interface Props {
  user: AccountUser | null;
  syncStatus: string;
  busy: boolean;
  onCode: (email: string) => Promise<void>;
  onRegister: (email: string, code: string, password: string) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onClose: () => void;
}

export default function AccountPanel({ user, syncStatus, busy, onCode, onRegister, onLogin, onLogout, onClose }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl);

  async function act(task: () => Promise<void>, success: string) {
    setMessage('');
    try { await task(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void act(() => mode === 'login' ? onLogin(email, password) : onRegister(email, code, password), mode === 'login' ? '已登录，正在恢复数据' : '注册成功，正在同步数据');
  }

  return <div className="account-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="account-panel panel-card" aria-label="用户账号">
      <button className="account-close" onClick={onClose} aria-label="关闭账号面板"><X size={20} /></button>
      <div className="account-title"><span className="eyebrow">YOUR ADVENTURE</span><h2>{user ? '冒险档案' : '保存你的冒险'}</h2><p>登录后，角色、聊天、任务和奖励会保存到你的账号。</p></div>
      {user ? <div className="account-profile"><div className="account-symbol"><Cloud size={25} /></div><b>{user.email}</b><p>{syncStatus}</p><button className="primary-button full" disabled={busy} onClick={() => void act(onLogout, '已退出登录')}><LogOut size={17} />退出登录</button></div> : <>
        <div className="account-switch"><button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setMessage(''); }}>登录</button><button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setMessage(''); }}>邮箱注册</button></div>
        <form className="account-form" onSubmit={submit}>
          <label>邮箱<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="例如：你的 QQ 邮箱" /></label>
          {mode === 'register' && <label>邮箱验证码<div className="account-code-row"><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.target.value)} placeholder="6 位验证码" /><button type="button" disabled={busy || !email.trim()} onClick={() => void act(() => onCode(email), '验证码已发出，请查看邮箱')}>发送验证码</button></div></label>}
          <label>密码<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 个字符" /></label>
          <button className="primary-button full" disabled={busy} type="submit">{mode === 'login' ? <LogIn size={17} /> : <Mail size={17} />}{busy ? '请稍候…' : mode === 'login' ? '登录并恢复数据' : '注册并保存数据'}</button>
        </form>
      </>}
      {message && <p className="account-message" role="status">{message}</p>}
      {!user && <details className="account-server"><summary>同步服务器设置</summary><p>电脑和手机连同一个 Wi-Fi 时，填入电脑显示的局域网地址，例如 http://192.168.1.10:8788。外网服务器请使用 HTTPS。</p><div className="account-code-row"><input type="url" aria-label="同步服务器地址" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="http://电脑内网IP:8788" /><button type="button" onClick={() => { try { setApiBaseUrl(serverUrl); setMessage('服务器地址已保存'); } catch (error) { setMessage(error instanceof Error ? error.message : '地址无效'); } }}>保存地址</button></div></details>}
      {!user && <p className="form-note">首次注册会把当前设备上的冒险数据保存到新账号；登录已有账号会恢复该账号的数据。</p>}
    </section>
  </div>;
}
