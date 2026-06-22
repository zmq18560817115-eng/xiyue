import { Router } from 'express';
import { getDb, persist } from '../db/store.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const unreadOnly = req.query.unread === 'true';
  let list = getDb().notifications.filter((n) => n.user_id === userId);
  if (unreadOnly) list = list.filter((n) => !n.read);
  list.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  res.json({ notifications: list });
});

router.patch('/:id/read', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const notif = db.notifications.find((n) => n.id === req.params.id && n.user_id === req.user!.id);
  if (!notif) return res.status(404).json({ error: '通知不存在' });
  notif.read = true;
  persist();
  res.json(notif);
});

export default router;
