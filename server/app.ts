import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import authRoutes from './routes/auth.js';
import patientsRoutes from './routes/patients.js';
import treatmentRoutes from './routes/treatment.js';
import doctorsRoutes from './routes/doctors.js';
import familyRoutes from './routes/family.js';
import notificationsRoutes from './routes/notifications.js';
import clinicalCasesRoutes from './routes/clinical-cases.js';
import deviceRoutes from './routes/device.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'KneeJoy API', version: '1.0.0' });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/patients', patientsRoutes);
  app.use('/api/v1/treatment', treatmentRoutes);
  app.use('/api/v1/doctors', doctorsRoutes);
  app.use('/api/v1/family', familyRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/clinical-cases', clinicalCasesRoutes);
  app.use('/api/v1/device', deviceRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res, next) => {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[KneeJoy API] 未处理异常:', err);
    res.status(500).json({
      error: '服务器内部错误',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  return app;
}
