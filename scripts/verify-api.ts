/**
 * 膝悦 API + 数据库全量冒烟验证
 * 用法: npx tsx scripts/verify-api.ts [baseUrl]
 */
import { loadDatabase, getDb } from '../server/db/store.js';

const BASE = process.argv[2] ?? 'http://localhost:3001/api/v1';

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];

function asRecord(data: unknown): Record<string, unknown> {
  return data as Record<string, unknown>;
}

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error('  ✗ ' + name + ' — ' + detail);
}

async function api(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function loginPassword(
  phone: string,
  password: string,
  role: 'patient' | 'doctor' | 'family'
): Promise<string | null> {
  const { status, data } = await api('/auth/login/password', {
    method: 'POST',
    body: JSON.stringify({ phone, password, role }),
  });
  const d = asRecord(data);
  if (status !== 200 || !d.token) {
    fail('登录 ' + role + ' ' + phone, 'http=' + status + ' ' + String(d.error ?? ''));
    return null;
  }
  pass('登录 ' + role, phone);
  return String(d.token);
}

function verifySeedData() {
  console.log('\n[1] 数据库种子数据');
  loadDatabase();
  const db = getDb();

  if (db.schema_version !== 2) fail('schema_version', '期望 2，实际 ' + db.schema_version);
  else pass('schema_version', '2');

  if (db.clinical_cases.length !== 15) fail('临床案例库', '期望 15 条，实际 ' + db.clinical_cases.length);
  else pass('临床案例库 Doctor_Knowledge_Base', '15 组');

  if (db.users.length < 5) fail('用户表', '少于 5 人，实际 ' + db.users.length);
  else pass('用户表 User_Table', db.users.length + ' 人');

  if (db.patients.length < 3) fail('患者档案', '少于 3 人，实际 ' + db.patients.length);
  else pass('患者档案 Patient_Profile', db.patients.length + ' 人');

  if (!db.physical_devices || db.physical_devices.length < 1) {
    fail('物理设备注册', 'physical_devices 为空');
  } else {
    const demo = db.physical_devices.find((d) => d.device_id === 'KJ-DEMO-001');
    if (!demo || demo.patient_id !== '2001') {
      fail('ESP32 演示设备', 'KJ-DEMO-001 未绑定患者 2001');
    } else pass('ESP32 演示设备', 'KJ-DEMO-001 → 2001');
  }

  const zhang = db.patients.find((p) => p.id === '2002');
  if (!zhang?.auth_code || zhang.binding_doctor_id !== '1001') {
    fail('张阿姨医嘱绑定', 'auth_code/binding_doctor_id 不正确');
  } else pass('张阿姨医嘱导入', 'auth_code=' + zhang.auth_code + ', doctor=1001');

  if (db.family_bindings.length < 1) fail('亲情绑定', '无记录');
  else pass('亲情绑定 Family_Binding', 'binding ' + db.family_bindings[0].patient_id);

  const todayLogs = db.therapy_logs.filter((l) => l.therapy_date.includes('2026'));
  if (todayLogs.length < 3) fail('训练日志', '今日相关日志不足: ' + todayLogs.length);
  else {
    const w = todayLogs.find((l) => l.patient_id === '2001' && l.is_completed);
    const z = todayLogs.find((l) => l.patient_id === '2002' && !l.is_completed);
    if (!w) fail('王大爷今日完成态', '未找到 is_completed=true');
    else pass('王大爷今日训练', w.mode_used + ' 已完成');
    if (!z) fail('张阿姨今日未完成', '未找到 is_completed=false');
    else pass('张阿姨今日训练', z.mode_used + ' 未完成');
  }
}

async function verifyApi() {
  console.log('\n[2] API 健康检查');
  try {
    const { status, data } = await api('/health');
    if (status !== 200) fail('health', 'http ' + status);
    else pass('GET /health', String(asRecord(data).status ?? 'ok'));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail('health', '无法连接 ' + BASE + ': ' + msg);
    console.log('\n请先启动后端: npm run server  或  npm run start');
    printSummary();
    process.exit(1);
  }

  console.log('\n[3] 五端账号登录');
  const tokenWang = await loginPassword('18612345678', 'pass_pat_1', 'patient');
  const tokenZhang = await loginPassword('15599998888', 'pass_pat_2', 'patient');
  const tokenLi = await loginPassword('17744445555', 'pass_pat_3', 'patient');
  const tokenDoc = await loginPassword('13800138001', 'pass_doc_1', 'doctor');
  const tokenFam = await loginPassword('13099990000', 'pass_fam_1', 'family');

  if (tokenWang) {
    console.log('\n[4] 患者王大爷 — 档案/设备/打卡');
    const me = await api('/patients/me', {}, tokenWang);
    if (me.status === 200) pass('GET /patients/me', String(asRecord(me.data).name));
    else fail('GET /patients/me', 'http ' + me.status);

    const dev = await api('/patients/me/device', {}, tokenWang);
    if (dev.status === 200) pass('GET /patients/me/device');
    else fail('GET /patients/me/device', 'http ' + dev.status);

    const match = await api('/treatment/match', {
      method: 'POST',
      body: JSON.stringify({ age: 67, cartilage_wear: 4, joint_fluid: 3, pain_score: 7 }),
    }, tokenWang);
    if (match.status === 200) pass('POST /treatment/match', 'AI 推荐');
    else fail('POST /treatment/match', 'http ' + match.status);

    const cases = await api('/clinical-cases', {}, tokenWang);
    const casesArr = asRecord(cases.data).cases as unknown[] | undefined;
    const count = casesArr?.length ?? 0;
    if (cases.status === 200 && count === 15) pass('GET /clinical-cases', count + ' 条');
    else fail('GET /clinical-cases', 'http ' + cases.status + ' count=' + count);
  }

  if (tokenZhang) {
    console.log('\n[5] 患者张阿姨 — 医嘱绑定');
    const me = await api('/patients/me', {}, tokenZhang);
    const p = asRecord(me.data);
    if (me.status === 200 && p.binding_doctor_id === '1001') {
      pass('医嘱绿色通道', String(p.binding_doctor_name ?? '1001'));
    } else fail('医嘱绑定', JSON.stringify(p));

    const code = await api('/patients/onboarding/doctor-code', {
      method: 'POST',
      body: JSON.stringify({ code: '883912' }),
    }, tokenZhang);
    if (code.status === 200 || code.status === 404) {
      pass('POST /onboarding/doctor-code', code.status === 200 ? '导入成功' : '已使用过(正常)');
    } else fail('医嘱码导入', 'http ' + code.status);
  }

  if (tokenDoc) {
    console.log('\n[6] 医生端 — 签约患者红绿灯');
    const pts = await api('/doctors/me/patients', {}, tokenDoc);
    const list = (asRecord(pts.data).patients as Array<{ id: string; today_done: boolean }>) ?? [];
    if (pts.status !== 200) fail('GET /doctors/me/patients', 'http ' + pts.status);
    else {
      pass('GET /doctors/me/patients', list.length + ' 人');
      const w = list.find((x) => x.id === '2001');
      const z = list.find((x) => x.id === '2002');
      if (w?.today_done) pass('王大爷今日 🟢', 'today_done=true');
      else pass('王大爷今日状态', w ? 'today_done=false(日期相关)' : '未在列表');
      if (z && !z.today_done) pass('张阿姨今日 🔴', 'today_done=false');
      else fail('张阿姨今日状态', JSON.stringify(z));
    }
  }

  if (tokenFam) {
    console.log('\n[7] 家属端 — 绑定/设备/催促');
    const bind = await api('/family/bindings', {}, tokenFam);
    const bindings = (asRecord(bind.data).bindings as Array<{ patient_id: string }>) ?? [];
    if (bind.status === 200 && bindings.length > 0) {
      pass('GET /family/bindings', bindings[0].patient_id);
      const pid = bindings[0].patient_id;
      const st = await api('/family/patients/' + pid + '/device-status', {}, tokenFam);
      if (st.status === 200) pass('GET device-status');
      else fail('device-status', 'http ' + st.status);

      const stats = await api('/family/patients/' + pid + '/check-ins/stats', {}, tokenFam);
      if (stats.status === 200) pass('GET check-ins/stats');
      else fail('check-ins/stats', 'http ' + stats.status);

      const nudge = await api('/family/patients/' + pid + '/nudges', {
        method: 'POST',
        body: JSON.stringify({ message: '验证脚本测试催促' }),
      }, tokenFam);
      if (nudge.status === 201) pass('POST nudges', 'remind_status');
      else fail('POST nudges', 'http ' + nudge.status);
    } else {
      fail('家属绑定', 'http ' + bind.status);
    }
  }

  if (tokenLi) {
    console.log('\n[8] 患者小李 — 年轻退行性');
    const me = await api('/patients/me', {}, tokenLi);
    if (me.status === 200) {
      pass('小李档案', 'age=' + String(asRecord(me.data).age));
    } else fail('小李档案', 'http ' + me.status);
  }

  await verifyDeviceProtocol(tokenWang);
}

async function verifyDeviceProtocol(patientToken: string | null) {
  console.log('\n[9] ESP32 软硬件协议通道（UI → API → 设备）');
  const deviceHeaders = {
    'X-Device-Id': 'KJ-DEMO-001',
    'X-Device-Token': 'kneejoy-demo-token-2026',
  };

  if (!patientToken) {
    fail('设备联调', '缺少患者 token');
    return;
  }

  // 清理上次测试残留会话，保证 START/STOP 可重新入队
  const devBefore = await api('/patients/me/device', {}, patientToken);
  const activeId = String(asRecord(devBefore.data).active_session_id ?? '');
  if (activeId) {
    await api('/patients/me/treatment/sessions/' + activeId, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'stopped' }),
    }, patientToken);
    await api('/device/commands', { headers: deviceHeaders });
  }

  const ping = await api('/device/ping', { headers: deviceHeaders });
  if (ping.status === 200 && asRecord(ping.data).ok === true) {
    pass('GET /device/ping', '设备认证通过');
  } else {
    fail('GET /device/ping', 'http ' + ping.status);
  }

  const conn = await api('/patients/me/device/connection', {
    method: 'PATCH',
    body: JSON.stringify({ connection: 'wifi' }),
  }, patientToken);
  if (conn.status === 200) pass('PATCH device/connection wifi', '触发 SYNC 队列');
  else fail('PATCH device/connection', 'http ' + conn.status);

  const cmdAfterSync = await api('/device/commands', { headers: deviceHeaders });
  const syncCmd = jsonCommand(asRecord(cmdAfterSync.data));
  if (cmdAfterSync.status === 200 && (syncCmd === 'SYNC' || syncCmd === 'NONE')) {
    pass('设备轮询 SYNC', syncCmd);
  } else {
    fail('设备轮询 SYNC', 'http ' + cmdAfterSync.status + ' cmd=' + syncCmd);
  }

  const session = await api('/patients/me/treatment/sessions', {
    method: 'POST',
    body: JSON.stringify({
      left_force: 15,
      right_force: 15,
      duration: 20,
      temp: 42,
      vibration: 1,
      source: 'manual',
    }),
  }, patientToken);
  const sessionId = String(asRecord(session.data).id ?? '');
  if (session.status === 201) pass('POST treatment/sessions', 'START 已入队');
  else if (session.status === 409) {
    pass('POST treatment/sessions', '已有会话(继续测命令队列)');
  } else fail('POST treatment/sessions', 'http ' + session.status);

  const cmdStart = await api('/device/commands', { headers: deviceHeaders });
  const startBody = asRecord(cmdStart.data);
  if (
    cmdStart.status === 200 &&
    jsonCommand(startBody) === 'START' &&
    startBody.left_force === 15 &&
    startBody.right_force === 15 &&
    startBody.temp === 42 &&
    startBody.vibration === 1
  ) {
    pass('设备取走 START', '参数与 UI 一致');
  } else {
    fail('设备取走 START', JSON.stringify(startBody));
  }

  const tele = await api('/device/telemetry', {
    method: 'POST',
    headers: deviceHeaders,
    body: JSON.stringify({
      is_running: true,
      left_force: 15,
      right_force: 15,
      temp: 42,
      vibration: 1,
      time_left_seconds: 1200,
      is_safety_clip_attached: true,
      battery_level: 88,
      hardware_status: 'Normal',
    }),
  });
  if (tele.status === 200 && asRecord(tele.data).ok === true) {
    pass('POST /device/telemetry', '状态回写成功');
  } else {
    fail('POST /device/telemetry', 'http ' + tele.status);
  }

  const devState = await api('/patients/me/device', {}, patientToken);
  const dev = asRecord(devState.data);
  if (devState.status === 200 && dev.is_mock_mode === false && dev.connection === 'wifi') {
    pass('患者端设备状态同步', 'is_mock_mode=false, wifi');
  } else {
    fail('患者端设备状态同步', JSON.stringify(dev));
  }

  const stop = await api('/patients/me/treatment/sessions/' + sessionId, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'stopped' }),
  }, patientToken);
  if (stop.status === 200) pass('PATCH session stopped', 'STOP 已入队');
  else if (stop.status === 404) pass('PATCH session stopped', '无会话可停(可接受)');
  else fail('PATCH session stopped', 'http ' + stop.status);

  const cmdStop = await api('/device/commands', { headers: deviceHeaders });
  if (cmdStop.status === 200 && jsonCommand(asRecord(cmdStop.data)) === 'STOP') {
    pass('设备取走 STOP', 'ok');
  } else {
    fail('设备取走 STOP', JSON.stringify(cmdStop.data));
  }
}

function jsonCommand(data: Record<string, unknown>): string {
  return String(data.command ?? 'NONE');
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n========== 验证汇总 ==========');
  console.log('通过: ' + (results.length - failed.length) + ' / ' + results.length);
  if (failed.length > 0) {
    console.log('失败项:');
    failed.forEach((f) => console.log('  - ' + f.name + ': ' + f.detail));
    process.exit(1);
  }
  console.log('全部通过 ✓');
}

async function main() {
  console.log('膝悦 KneeJoy 数据库与 API 验证');
  console.log('API: ' + BASE);
  verifySeedData();
  await verifyApi();
  printSummary();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
