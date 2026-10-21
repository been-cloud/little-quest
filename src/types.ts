export type Scene = 'announce' | 'start' | 'complete' | 'missed' | 'reward' | 'reminder' | 'accepted';

export interface PlanItem {
  id: string;
  title: string;
  note: string;
  startLocal: string;
  remindLocal: string;
  durationMinutes: number;
}

export interface PlanProposal {
  id: string;
  reply: string;
  items: PlanItem[];
  mode: 'ai' | 'demo';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'character';
  text: string;
  createdAt: string;
}

export interface CharacterCard {
  name: string;
  description: string;
  backstory?: string;
  lore?: { kind: string; fact: string; quote: string }[];
  traits: string[];
  voice: string[];
  appearance?: string[];
  catchphrases: string[];
  boundaries: string[];
  evidence: { claim: string; quote: string }[];
  sampleLines: { scene: string; line: string }[];
}

export interface Character extends CharacterCard {
  id: string;
  avatar?: string;
  mode: 'demo' | 'ai' | 'starter';
}

export interface Quest {
  id: string;
  title: string;
  note: string;
  dueAt: string;
  remindAt?: string;
  reminderLine?: string;
  durationMinutes?: number;
  category: '学习' | '工作' | '生活' | '其他';
  done: boolean;
  createdAt: string;
  completedAt?: string;
  reminded?: boolean;
  questLine?: string;
}

export interface FocusSession {
  id: string;
  taskId?: string;
  minutes: number;
  completedAt: string;
}

export interface AppData {
  character: Character;
  quests: Quest[];
  sessions: FocusSession[];
  coins: number;
  messages: ChatMessage[];
  pendingPlan: PlanProposal | null;
}
