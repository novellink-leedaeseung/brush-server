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
app.use(express.static('public'));

// 학생 사진 폴더 보장
const studentDir = path.join(__dirname, 'public', 'assets', 'student', 'images');
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
