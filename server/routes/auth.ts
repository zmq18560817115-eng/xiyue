import { Router } from 'express';
import {
  createToken,
  generateId,
  getDb,
  getUserIdByToken,
  normalizePhone,
  persist,
  revokeToken,
} from '../db/store.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { extractToken, requireAuth } from '../middleware/auth.js';
import type { UserRole } from '../types.js';

const router = Router();

const DEMO_SMS_CODES: Record<string, string> = {
  '18612345678': '2026',
  '15599998888': '2026',
  '17744445555': '2026',
  '13800138001': '9988',
  '13099990000': '5201',
  /** 三端检流程 v2 演示账号 */
  '18800002004': '2004',
  '13800002002': '8802',
  '13000002002': '8803',
  /** 全新新人患者检流程 */
  '18900003005': '3005',
};

router.post('/sms/send', (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    return res.status(400).json({ error: '请提供手机号' });
  }
  const normalized = normalizePhone(phone);
  const db = getDb();
  const code = DEMO_SMS_CODES[normalized] ?? '2026';
  db.sms_codes[normalized] = {
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  persist();
  res.json({
    success: true,
    message: '验证码已发送（开发模式：任意 4-6 位数字均可登录）',
    dev_hint: code,
  });
});

function isValidSmsCode(code: string): boolean {
  return /^\d{4,6}$/.test(code.trim());
}

/** 患者端：未注册手机号验证/首次密码登录时自动建档并写入数据库 */
function findOrCreatePatientUser(phone: string, password?: string) {
  const db = getDb();
  const normalized = normalizePhone(phone);
  let user = db.users.find((u) => u.phone === normalized && u.role === 'patient');
  if (user) {
    if (password && !user.password) {
      user.password = password;
      persist();
    }
    return user;
  }

  const id = generateId('user_patient');
  const patientId = generateId('pat');
  user = {
    id,
    role: 'patient',
    phone: normalized,
    name: '新患者',
    patient_id: patientId,
    created_at: new Date().toISOString(),
    ...(password ? { password } : {}),
  };
  db.users.push(user);

  db.patients.push({
    id: patientId,
    user_id: id,
    name: user.name,
    age: 60,
    phone: normalized,
    cartilage_wear: 3,
    joint_fluid: 2,
    pain_score: 5,
    attendance_rate: 0,
    check_in_dates: [],
    history: [],
    onboarding_completed: false,
    symptoms_assessed: false,
  });

  db.devices[patientId] = {
    is_mock_mode: true,
    connection: 'disconnected',
    is_running: false,
    left_force: 15,
    right_force: 15,
    duration: 20,
    temp: 42,
    vibration: 1,
    time_left_seconds: 1200,
    max_force_limit: 35,
    is_safety_clip_attached: true,
    battery_level: 100,
  };

  persist();
  return user;
}

router.post('/login/phone', (req, res) => {
  try {
    const { phone, code, role } = req.body as {
      phone?: string;
      code?: string;
      role?: UserRole;
    };
    if (!phone || !code || !role) {
      return res.status(400).json({ error: '请提供 phone、code、role' });
    }
    if (!['patient', 'doctor', 'family'].includes(role)) {
      return res.status(400).json({ error: 'role 无效' });
    }
    if (!isValidSmsCode(code)) {
      return res.status(401).json({ error: '验证码格式不正确，请输入4-6位数字' });
    }
    const normalized = normalizePhone(phone);
    if (role !== 'patient') {
      const existing = getDb().users.find((u) => u.phone === normalized && u.role === role);
      if (!existing) {
        return res.status(401).json({ error: '账号不存在，医生/家属需使用已注册演示账号登录' });
      }
      const user = existing;
      const token = createToken(user.id);
      return res.json({
        token,
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          phone: user.phone,
          patient_id: user.patient_id,
          doctor_id: user.doctor_id,
          family_id: user.family_id,
        },
        is_new_user: false,
      });
    }
    const wasNew = !getDb().users.some((u) => u.phone === normalized && u.role === 'patient');
    const user = findOrCreatePatientUser(phone);
    const token = createToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        phone: user.phone,
        patient_id: user.patient_id,
        doctor_id: user.doctor_id,
        family_id: user.family_id,
      },
      is_new_user: wasNew,
    });
  } catch (err) {
    console.error('[auth/login/phone]', err);
    res.status(500).json({ error: '登录处理失败，请确认后端服务已正常启动' });
  }
});

router.post('/login/password', (req, res) => {
  try {
    const { phone, password, role } = req.body as {
      phone?: string;
      password?: string;
      role?: UserRole;
    };
    if (!phone || !password || !role) {
      return res.status(400).json({ error: '请提供 phone、password、role' });
    }
    if (!['patient', 'doctor', 'family'].includes(role)) {
      return res.status(400).json({ error: 'role 无效' });
    }
    const normalized = normalizePhone(phone);
    let user = getDb().users.find((u) => u.phone === normalized && u.role === role);
    let isNewUser = false;

    if (!user) {
      if (role !== 'patient') {
        return res.status(401).json({ error: '账号不存在，医生/家属需使用已注册演示账号登录' });
      }
      user = findOrCreatePatientUser(phone, password);
      isNewUser = true;
    } else if (user.password && user.password !== password) {
      return res.status(401).json({ error: '密码错误' });
    }

    const token = createToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        phone: user.phone,
        patient_id: user.patient_id,
        doctor_id: user.doctor_id,
        family_id: user.family_id,
      },
      is_new_user: isNewUser,
    });
  } catch (err) {
    console.error('[auth/login/password]', err);
    res.status(500).json({ error: '登录处理失败，请确认后端服务已正常启动' });
  }
});

router.post('/logout', (req, res) => {
  const token = extractToken(req);
  if (token) revokeToken(token);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    patient_id: user.patient_id,
    doctor_id: user.doctor_id,
    family_id: user.family_id,
  });
});

export default router;
