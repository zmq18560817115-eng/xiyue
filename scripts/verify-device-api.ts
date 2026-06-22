#!/usr/bin/env tsx
/**
 * 命令行验证 ESP32 设备 HTTP API
 * 用法：npm run verify:device -- 192.168.1.100
 */

import {
  faultLabel,
  getDeviceInfo,
  getDeviceStatus,
  pingDevice,
  postStop,
  postTare,
  uiForceToApi,
} from '../src/hardware/deviceApi';

const ip = process.argv[2] ?? process.env.DEVICE_IP;
if (!ip) {
  console.error('用法: npm run verify:device -- <设备IP>');
  console.error('示例: npm run verify:device -- 192.168.1.100');
  process.exit(1);
}

const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;

async function main() {
  console.log(`\nKneeJoy 设备 API 联调 → ${baseUrl}\n`);

  const info = await getDeviceInfo(baseUrl);
  console.log('GET /api/device');
  console.log(JSON.stringify(info, null, 2));

  const status = await getDeviceStatus(baseUrl);
  console.log('\nGET /api/status');
  console.log(
    JSON.stringify(
      {
        force_l: status.force_l,
        force_r: status.force_r,
        temp: status.temp,
        estop: status.estop,
        fault: faultLabel(status.fault),
        ip: status.ip,
      },
      null,
      2
    )
  );

  await pingDevice(baseUrl);
  console.log('\n✓ ping 通过（device + status）');

  console.log('\n力值映射示例: UI 15N → API', uiForceToApi(15), 'N');
  console.log('力值映射示例: UI 5N  → API', uiForceToApi(5), '（关闭）');

  if (process.argv.includes('--stop')) {
    await postStop(baseUrl);
    console.log('\nPOST /api/stop → ok');
  }

  if (process.argv.includes('--tare')) {
    await postTare(baseUrl);
    console.log('\nPOST /api/tare → ok');
  }

  console.log('\n联调完成。如需测试急停/去皮：');
  console.log(`  npm run verify:device -- ${ip} --stop`);
  console.log(`  npm run verify:device -- ${ip} --tare\n`);
}

main().catch((err) => {
  console.error('\n✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
