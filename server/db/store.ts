import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Database } from '../types.js';
import { createSeedDatabase } from './seed.js';
import { alignDemoTherapyDates } from './therapy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'kneejoy.json');

let db: Database = createSeedDatabase();
const sessions = new Map<string, string>();

function reloadSessionsFromDb(): void {
  sessions.clear();
  if (!db.auth_tokens) {
    db.auth_tokens = {};
    return;
  }
  for (const [token, userId] of Object.entries(db.auth_tokens)) {
    sessions.set(token, userId);
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDatabase(): void {
  ensureDataDir();
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Database;
      if (parsed.schema_version !== 2 || !parsed.therapy_logs) {
        db = createSeedDatabase();
        persist();
      } else {
        db = parsed;
        if (!db.therapy_logs) db.therapy_logs = [];
        if (!db.physical_devices) {
          db.physical_devices = createSeedDatabase().physical_devices ?? [];
          persist();
        }
      }
    } catch {
      db = createSeedDatabase();
      persist();
    }
  } else {
    db = createSeedDatabase();
    persist();
  }

  alignDemoTherapyDates();
  syncDemoSeedAccounts();
  reloadSessionsFromDb();
}

/** 已有本地库时仍补齐种子里的演示账号（避免删库后漏同步 v2 医生/家属） */
function syncDemoSeedAccounts(): void {
  const seed = createSeedDatabase();
  let changed = false;

  for (const user of seed.users) {
    if (!db.users.some((u) => u.phone === user.phone && u.role === user.role)) {
      db.users.push(user);
      changed = true;
    }
  }
  for (const doc of seed.doctors) {
    if (!db.doctors.some((d) => d.id === doc.id)) {
      db.doctors.push(doc);
      changed = true;
    }
    const user = db.users.find((u) => u.id === doc.user_id);
    if (user && user.name !== doc.name) {
      user.name = doc.name;
      changed = true;
    }
  }
  for (const pat of seed.patients) {
    if (db.patients.some((p) => p.id === pat.id)) {
      continue;
    }
    const seedUser = seed.users.find((u) => u.patient_id === pat.id);
    // 仅当同手机号已被「非种子」自动注册账号占用时，跳过种子患者
    if (
      seedUser &&
      db.users.some(
        (u) => u.role === 'patient' && u.phone === seedUser.phone && u.id !== seedUser.id,
      )
    ) {
      continue;
    }
    db.patients.push(pat);
    changed = true;
  }

  const userIds = new Set(db.users.map((u) => u.id));
  const pruned = db.patients.filter((p) => userIds.has(p.user_id));
  if (pruned.length !== db.patients.length) {
    db.patients = pruned;
    changed = true;
  }
  for (const [pid, device] of Object.entries(seed.devices)) {
    if (!db.devices[pid]) {
      db.devices[pid] = device;
      changed = true;
    } else if (
      !db.devices[pid].is_running &&
      device.connection !== 'disconnected' &&
      db.devices[pid].connection === 'disconnected'
    ) {
      // 演示账号（如王大爷）重启后恢复默认蓝牙已配对态，避免一直显示离线
      db.devices[pid].connection = device.connection;
      changed = true;
    }
  }
  for (const code of seed.auth_codes) {
    if (!db.auth_codes.some((a) => a.code === code.code)) {
      db.auth_codes.push(code);
      changed = true;
    }
  }
  for (const binding of seed.family_bindings) {
    if (!db.family_bindings.some((b) => b.id === binding.id)) {
      db.family_bindings.push(binding);
      changed = true;
    }
  }
  if (!db.physical_devices) {
    db.physical_devices = seed.physical_devices ?? [];
    changed = true;
  } else {
    for (const pd of seed.physical_devices ?? []) {
      if (!db.physical_devices.some((d) => d.device_id === pd.device_id)) {
        db.physical_devices.push(pd);
        changed = true;
      }
    }
  }

  if (changed) {
    persist();
  }
}

export function persist(): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function getDb(): Database {
  return db;
}

export function resetDatabase(): void {
  db = createSeedDatabase();
  sessions.clear();
  reloadSessionsFromDb();
  persist();
}

export function createToken(userId: string): string {
  const token = `kj_${crypto.randomUUID().replace(/-/g, '')}`;
  if (!db.auth_tokens) db.auth_tokens = {};
  db.auth_tokens[token] = userId;
  sessions.set(token, userId);
  persist();
  return token;
}

export function getUserIdByToken(token: string | undefined): string | null {
  if (!token) return null;
  const cached = sessions.get(token);
  if (cached) return cached;
  const fromDb = db.auth_tokens?.[token];
  if (fromDb) {
    sessions.set(token, fromDb);
    return fromDb;
  }
  return null;
}

export function revokeToken(token: string): void {
  sessions.delete(token);
  if (db.auth_tokens?.[token]) {
    delete db.auth_tokens[token];
    persist();
  }
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}
