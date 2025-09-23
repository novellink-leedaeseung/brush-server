// app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const {JsonMemberRepo} = require('./repos/members.repo.json.js');
const {MembersService} = require('./services/members.service.js');
const {membersRoutes} = require('./routes/members.routes.js');
const {photosRoutes} = require('./routes/photos.routes.js');
const {notificationRoutes} = require('./routes/notification.routes.js');

const app = express();

/** ✅ 1) CORS 옵션(프리뷰 4173, dev 5173, 127.0.0.1, LAN IP까지 허용) */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
// 로컬 네트워크에서 --host로 띄웠을 때(예: http://192.168.x.x:4173)도 허용하고 싶다면 정규식 사용
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // 모바일웹뷰/스크립트 등 Origin 없는 요청 허용 (필요 없으면 false로)
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return true;
};

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
};

// ✅ 반드시 라우터/정적 서빙보다 먼저
app.use(cors(corsOptions));
// ✅ 프리플라이트(OPTIONS) 빠르게 응답
app.options('*', cors(corsOptions));

app.use(express.json({limit: '50mb'}));

// pkg로 빌드되면 __dirname은 snapshot(읽기 전용)이 될 수 있음
const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;

// public 폴더 기준 경로
const publicDir = path.join(baseDir, 'public');
app.use(express.static(publicDir));

// 학생 사진 폴더 보장 (exe 밖에서 생성)
const studentDir = path.join(publicDir, 'assets', 'student', 'images');
fs.mkdirSync(studentDir, {recursive: true});

// 레포/서비스 초기화 함수
async function initServices() {
  const repo = new JsonMemberRepo();
  await repo.init();
  const svc = new MembersService(repo);

  // 라우터 장착
  app.use('/api/members', membersRoutes(svc));
  app.use('/api/save-photo', photosRoutes(studentDir));
  // 알림 라우트가 /api/notification 형태라면 prefix를 명시적으로 붙이는 게 안전
  app.use('/api/notification', notificationRoutes);
}

// 서비스 초기화 실행
initServices().catch(console.error);

// 헬스/에러
app.get('/api/health', (req, res) => res.json({status: 'OK'}));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({success: false, error: err.message || 'Server Error'});
});

module.exports = app;
