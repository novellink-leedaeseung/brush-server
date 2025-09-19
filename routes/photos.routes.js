// routes/photos.routes.js (현 로직 그대로 유지)
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const photosRoutes = (studentDir) => {
  const r = Router();
  r.post('/save-photo', (req, res) => {
    try {
      const { imageData, fileName } = req.body ?? {};
      if (!imageData || !fileName)
        return res.status(400).json({ success: false, error: '이미지 데이터와 파일명이 필요합니다.' });

      const base64 = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const safe = String(fileName).replace(/[^a-zA-Z0-9가-힣\-_]/g, '');
      const filePath = path.join(studentDir, `${safe}.jpg`);
      fs.writeFileSync(filePath, base64, 'base64');

      res.json({ success: true, fileName: `${safe}.jpg`, filePath: `/assets/student/${safe}.jpg` });
    } catch (e) {
      res.status(500).json({ success: false, error: '사진 저장 중 오류' });
    }
  });
  return r;
};
