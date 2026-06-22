import { formatTimestamp, generateId, getDb, persist } from '../db/store.js';
import type { NotificationType } from '../types.js';

export function pushNotification(opts: {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  action_by?: string;
}) {
  const db = getDb();
  const notification = {
    id: generateId('not'),
    user_id: opts.user_id,
    type: opts.type,
    title: opts.title,
    message: opts.message,
    timestamp: formatTimestamp(),
    read: false,
    action_by: opts.action_by,
  };
  db.notifications.push(notification);
  persist();
  return notification;
}

export function getPatientUserId(patientId: string): string | undefined {
  const db = getDb();
  const patient = db.patients.find((p) => p.id === patientId);
  return patient?.user_id;
}
