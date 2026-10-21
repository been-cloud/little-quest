import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Character, Quest } from './types';

export function nativeRemindersAvailable() {
  return Capacitor.isNativePlatform();
}

function notificationId(questId: string) {
  let hash = 2166136261;
  for (const char of questId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2147483646 + 1;
}

export async function requestReminderPermission(): Promise<boolean> {
  if (nativeRemindersAvailable()) {
    let status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') status = await LocalNotifications.requestPermissions();
    return status.display === 'granted';
  }
  if ('Notification' in window) return (await Notification.requestPermission()) === 'granted';
  return false;
}

export async function scheduleQuestReminder(quest: Quest, character: Character): Promise<boolean> {
  if (!quest.remindAt || new Date(quest.remindAt).getTime() <= Date.now()) return false;
  if (!nativeRemindersAvailable()) return false;
  const allowed = await requestReminderPermission();
  if (!allowed) return false;
  await LocalNotifications.schedule({ notifications: [{
    id: notificationId(quest.id),
    title: `${character.name} 给你的消息`,
    body: quest.reminderLine || `别忘了「${quest.title}」哦，我们约好的时间快到了。`,
    schedule: { at: new Date(quest.remindAt) },
    isExactNotification: false,
    extra: { questId: quest.id },
  }] });
  return true;
}

export async function cancelQuestReminder(questId: string) {
  if (!nativeRemindersAvailable()) return;
  await LocalNotifications.cancel({ notifications: [{ id: notificationId(questId) }] });
}
