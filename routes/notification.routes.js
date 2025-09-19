// routes/notification.routes.js
import { Router } from 'express';
import { asyncHandler } from '../core/asyncHandler.js';
import path from 'path';
import fs from 'fs';

export const notificationRoutes = (svc) => {
  const r = Router();

  r.get(
    '/',
    asyncHandler(async (req, res) => {
      const folder = path.join(process.cwd(), 'public', 'assets', 'notification');

      // ✅ 허용 확장자 목록 (필요하면 추가 가능)
      const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm', '.ogg'];

      try {
        const files = fs
          .readdirSync(folder)
          .filter((f) => allowedExt.includes(path.extname(f).toLowerCase()));

        // public 정적 경로 기준으로 응답
        res.json(files.map((f) => `/assets/notification/${f}`));
      } catch (err) {
        console.error('❌ 폴더 읽기 실패:', err);
        res.status(500).json({ error: '폴더 읽기 실패' });
      }
    })
  );

  return r;
};
