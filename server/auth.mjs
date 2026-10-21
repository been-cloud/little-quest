import { randomBytes, randomInt, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const scrypt = promisify(scryptCallback);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const publicUser = (user) => ({ id: user.id, email: user.email, createdAt: user.createdAt });
const emailOf = (value) => String(value || '').trim().toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const validPassword = (value) => typeof value === 'string' && value.length >= 8 && value.length <= 128;

export class AccountStore {
  constructor(path) {
    this.path = path;
    this.queue = Promise.resolve();
    this.failedLogins = new Map();
  }

  async read() {
    try { return JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return { users: [], challenges: [], sessions: [], snapshots: {} };
      throw error;
    }
  }

  async write(state) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, this.path);
  }

  mutate(action) {
    const run = this.queue.then(async () => {
      const state = await this.read();
      const result = await action(state);
      await this.write(state);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async requestCode(rawEmail, send, now = Date.now()) {
    const email = emailOf(rawEmail);
    if (!validEmail(email)) throw new Error('邮箱格式不正确');
    return this.mutate(async (state) => {
      if (state.users.some((user) => user.email === email)) throw new Error('邮箱已注册，请直接登录');
      const previous = state.challenges.find((item) => item.email === email);
      if (previous && now - previous.sentAt < 60000) throw new Error('验证码发送太频繁，请稍后再试');
      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      await send(email, code);
      state.challenges = state.challenges.filter((item) => item.email !== email && item.expiresAt > now);
      state.challenges.push({ email, codeHash: digest(code), sentAt: now, expiresAt: now + 10 * 60 * 1000, attempts: 0 });
      return { expiresInSeconds: 600 };
    });
  }

  async register(rawEmail, code, password, now = Date.now()) {
    const email = emailOf(rawEmail);
    if (!validEmail(email)) throw new Error('邮箱格式不正确');
    if (!validPassword(password)) throw new Error('密码需要 8–128 个字符');
    return this.mutate(async (state) => {
      if (state.users.some((user) => user.email === email)) throw new Error('邮箱已注册，请直接登录');
      const challenge = state.challenges.find((item) => item.email === email);
      if (!challenge || challenge.expiresAt < now || challenge.attempts >= 5) throw new Error('验证码已失效，请重新获取');
      challenge.attempts++;
      if (!/^\d{6}$/.test(String(code)) || digest(String(code)) !== challenge.codeHash) {
        await this.write(state);
        throw new Error('验证码不正确');
      }
      const salt = randomBytes(16).toString('hex');
      const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
      const user = { id: randomBytes(16).toString('hex'), email, salt, passwordHash, createdAt: new Date(now).toISOString() };
      state.users.push(user);
      state.challenges = state.challenges.filter((item) => item.email !== email);
      const token = this.addSession(state, user.id, now);
      return { user: publicUser(user), token };
    });
  }

  addSession(state, userId, now) {
    const token = randomBytes(32).toString('hex');
    state.sessions = state.sessions.filter((item) => item.expiresAt > now);
    state.sessions.push({ userId, tokenHash: digest(token), expiresAt: now + 30 * 24 * 60 * 60 * 1000 });
    return token;
  }

  async login(rawEmail, password, now = Date.now()) {
    const email = emailOf(rawEmail);
    const failed = this.failedLogins.get(email);
    if (failed?.until > now) throw new Error('登录尝试过多，请稍后再试');
    return this.mutate(async (state) => {
      const user = state.users.find((item) => item.email === email);
      const actual = await scrypt(String(password || ''), user?.salt || 'invalid', 64);
      const expected = Buffer.from(user?.passwordHash || '00'.repeat(64), 'hex');
      if (!user || !timingSafeEqual(actual, expected)) {
        const attempts = (failed?.attempts || 0) + 1;
        this.failedLogins.set(email, { attempts, until: attempts >= 5 ? now + 15 * 60 * 1000 : 0 });
        throw new Error('邮箱或密码不正确');
      }
      this.failedLogins.delete(email);
      return { user: publicUser(user), token: this.addSession(state, user.id, now) };
    });
  }

  async currentUser(token, now = Date.now()) {
    if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
    const state = await this.read();
    const session = state.sessions.find((item) => item.tokenHash === digest(token) && item.expiresAt > now);
    const user = state.users.find((item) => item.id === session?.userId);
    return user ? publicUser(user) : null;
  }

  async logout(token) {
    if (!token) return;
    await this.mutate((state) => { state.sessions = state.sessions.filter((item) => item.tokenHash !== digest(token)); });
  }

  async getSnapshot(userId) {
    const state = await this.read();
    const snapshot = state.snapshots[userId];
    return snapshot ? { revision: snapshot.revision, data: snapshot.data } : { revision: 0, data: null };
  }

  async saveSnapshot(userId, expectedRevision, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 5_000_000) throw new Error('用户数据无效或超过 5 MB');
    return this.mutate((state) => {
      const previous = state.snapshots[userId] || { revision: 0, data: null, history: [] };
      if (previous.revision !== expectedRevision) throw new Error('同步冲突：另一台设备已经更新数据');
      const history = previous.data === null ? [] : [...(previous.history || []), { revision: previous.revision, data: previous.data }].slice(-5);
      state.snapshots[userId] = { revision: previous.revision + 1, data, history, savedAt: new Date().toISOString() };
      return { revision: previous.revision + 1 };
    });
  }
}
