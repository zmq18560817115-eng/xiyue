import type { Request, Response, NextFunction } from 'express';
import { getDb, getUserIdByToken } from '../db/store.js';
import type { User, UserRole } from '../types.js';

export interface AuthedRequest extends Request {
  user?: User;
  token?: string;
}

export function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return req.headers['x-auth-token'] as string | undefined;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const userId = getUserIdByToken(token);
  if (!userId) {
    return res.status(401).json({ error: '未登录或 token 已失效' });
  }
  const user = getDb().users.find((u) => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }
  req.user = user;
  req.token = token;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '无权访问此资源' });
    }
    next();
  };
}
