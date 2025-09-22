// app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { JsonMemberRepo } = require('./repos/members.repo.json.js');
const { MembersService } = require('./services/members.service.js');
const { membersRoutes } = require('./routes/members.routes.js');
const { photosRoutes } = require('./routes/photos.routes.js');
const { notificationRoutes } = require('./routes/notification.routes.js');

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'https://localhost:5173'], credentials: true }));
app.use(express.json({ limit: '50mb' }));

// pkg로 빌드되면 __dirname은 snapshot(읽기 전용)이 될 수 있음
const isPkg = typeof process.pkg !== 'undefined';
// 실행 가능한 쓰기 경로: exe가 있는 폴더
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;

// public 폴더 기준 경로
const publicDir = path.join(baseDir, 'public');
app.use(express.static(publicDir));

// 학생 사진 폴더 보장 (exe 밖에서 생성)
const studentDir = path.join(publicDir, 'assets', 'student', 'images');
fs.mkdirSync(studentDir, { recursive: true });

// 레포/서비스 초기화 함수
async function initServices() {
  const repo = new JsonMemberRepo();
  await repo.init();
  const svc = new MembersService(repo);

  // 라우터 장착
  app.use('/api/members', membersRoutes(svc));
  app.use('/api', photosRoutes(studentDir));
  app.use(notificationRoutes);
}

// 서비스 초기화 실행
initServices().catch(console.error);

// 헬스/에러
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, error: err.message || 'Server Error' });
});

module.exports = app;
