// app.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { JsonMemberRepo } from './repos/members.repo.json.js';
import { MembersService } from './services/members.service.js';
import { membersRoutes } from './routes/members.routes.js';
import { photosRoutes } from './routes/photos.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'https://localhost:5173'], credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// 학생 사진 폴더 보장
const studentDir = path.join(__dirname, 'public', 'assets', 'student');
fs.mkdirSync(studentDir, { recursive: true });

// 레포/서비스 초기화
const repo = new JsonMemberRepo();
await repo.init();
const svc = new MembersService(repo);

// 라우터 장착
app.use('/api/members', membersRoutes(svc));
app.use('/api', photosRoutes(studentDir));
app.use('/api/notifications', notificationRoutes());

// 헬스/에러
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ success: false, error: err.message ?? 'Server Error' });
});


export default app;

