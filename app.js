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
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
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

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({limit: '50mb'}));

// pkg로 빌드되면 __dirname은 snapshot(읽기 전용)일 수 있음
const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;

// public 폴더
const publicDir = path.join(baseDir, 'public');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/logo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'assets' ,'logo', 'logo.png'));
});


// 학생 사진 저장 폴더 보장
const studentDir = path.join(publicDir, 'assets', 'student', 'images');
fs.mkdirSync(studentDir, {recursive: true});

// =========================
// ⭐ 포트 설정(런타임 변경: JSON 감시)
// =========================
const DEFAULT_PORT = 3001;

function getRuntimeDir() {
  if (typeof process.pkg !== 'undefined') {
    return path.dirname(process.execPath);
  }
  const mainFile = (require.main && require.main.filename) || process.argv[1] || __filename;
  return path.dirname(mainFile);
}

function getWritableDir() {
  const base = getRuntimeDir();
  try {
    const test = path.join(base, '.port_write_test');
    fs.writeFileSync(test, 'ok');
    fs.unlinkSync(test);
    return base; // exe(또는 스크립트)와 같은 폴더에 쓰기 가능
  } catch {
    const home = process.env.APPDATA || process.env.HOME || process.cwd();
    const dir = path.join(home, 'kiosk-server');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

const RUNTIME_DIR = getWritableDir();
const CONFIG_PATH = path.join(RUNTIME_DIR, 'server.config.json');

/* 첫 실행 시 템플릿 복사 */
function ensureConfigFromTemplate() {
  if (fs.existsSync(CONFIG_PATH)) return;
  try {
    const templatePath = path.join(__dirname, 'server.config.default.json');
    if (fs.existsSync(templatePath)) {
      const buf = fs.readFileSync(templatePath);
      fs.writeFileSync(CONFIG_PATH, buf);
      console.log('[config] created from template:', CONFIG_PATH);
    }
  } catch (e) {
    console.warn('[config] template copy failed:', e);
  }
}
ensureConfigFromTemplate();

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('[config] read fail:', e);
  }
  return {};
}

function parseArgPort() {
  const i = process.argv.findIndex(a => a === '--port');
  if (i >= 0 && process.argv[i+1]) return Number(process.argv[i+1]);
  const kv = process.argv.find(a => a.startsWith('--port='));
  if (kv) return Number(kv.split('=')[1]);
  return undefined;
}

// 우선순위: CLI > ENV > server.config.json > DEFAULT
function resolvePort() {
  const arg = parseArgPort();
  if (Number.isFinite(arg)) return arg;
  const env = Number(process.env.PORT);
  if (Number.isFinite(env)) return env;
  const cfg = loadConfig();
  const cport = Number(cfg.port);
  if (Number.isFinite(cport)) return cport;
  return DEFAULT_PORT;
}

let server = null;
function startServer(port) {
  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      const actual = server.address().port;
      console.log(`[server] listening on http://localhost:${actual}`);
      console.log('[server] config at:', CONFIG_PATH);
      resolve(actual);
    });
    server.on('error', (err) => {
      console.error('[server] listen error:', err && err.code, err && err.message);
      reject(err);
    });
  });
}
function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

// ✅ JSON 파일 변경 감시 → 포트 달라지면 자동 재바인딩
// ✅ 파일 변경 감지: fs.watch 대신 폴링(mtime + 내용 비교)로 안정화
function watchPortConfig(intervalMs = 1000) {
  let lastMtimeMs = 0;
  let lastPort = null;
  let timer = null;

  const readPort = () => {
    try {
      if (!fs.existsSync(CONFIG_PATH)) return null;
      const stat = fs.statSync(CONFIG_PATH);
      const mtimeMs = stat.mtimeMs;
      if (mtimeMs === lastMtimeMs) return null; // 변경 없음

      // 변경 감지됨 → mtime 갱신 후 내용 읽기
      lastMtimeMs = mtimeMs;

      const cfg = loadConfig();
      const nextPort = Number(cfg.port);
      if (!Number.isFinite(nextPort) || nextPort <= 0 || nextPort > 65535) {
        console.warn('[server] ignore invalid port in server.config.json:', cfg.port);
        return null;
      }
      return nextPort;
    } catch (e) {
      console.warn('[server] watch read error:', e?.message || e);
      return null;
    }
  };

  const tick = async () => {
    const nextPort = readPort();
    if (nextPort == null) return;

    const cur = server && server.address && server.address().port;
    if (cur == null) {
      // 서버가 아직 안 떠 있으면 그냥 시작만
      try {
        await startServer(nextPort);
        lastPort = nextPort;
      } catch (e) {
        console.error('[server] start failed:', e?.code, e?.message);
      }
      return;
    }

    if (cur === nextPort) {
      lastPort = nextPort;
      return; // 동일하면 무시
    }

    console.log(`[server] config change detected. Rebinding ${cur} → ${nextPort}`);
    try {
      await stopServer();
      await startServer(nextPort);
      lastPort = nextPort;
    } catch (e) {
      console.error('[server] rebind failed:', e?.code, e?.message);
      // 실패하면 이전 포트로 복구 시도
      try {
        await startServer(cur || 0);
        console.log('[server] reverted to previous port:', cur);
      } catch (e2) {
        console.error('[server] revert failed:', e2?.code, e2?.message);
      }
    }
  };

  // 초기 상태 기억(없으면 0)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      lastMtimeMs = fs.statSync(CONFIG_PATH).mtimeMs;
      const cfg = loadConfig();
      const p = Number(cfg.port);
      if (Number.isFinite(p)) lastPort = p;
    }
  } catch {}

  if (timer) clearInterval(timer);
  timer = setInterval(tick, intervalMs);
  console.log('[server] polling config:', CONFIG_PATH, `every ${intervalMs}ms`);
}

// =========================
// 레포/서비스 초기화
// =========================
async function initServices() {
  const repo = new JsonMemberRepo();
  await repo.init();
  const svc = new MembersService(repo);

  app.use('/api/members', membersRoutes(svc));
  app.use('/api/save-photo', photosRoutes(studentDir));
  app.use('/api/notification', notificationRoutes);
}

const initReady = initServices().catch(console.error);

// 헬스/에러
app.get('/api/health', (req, res) => res.json({status: 'OK'}));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({success: false, error: err.message || 'Server Error'});
});

// =========================
/* 모듈/직접 실행 양립 */
// =========================
app.startServer = startServer;
app.stopServer = stopServer;
app.resolvePort = resolvePort;
app.configPath = CONFIG_PATH;
app.watchPortConfig = watchPortConfig; // 필요시 외부에서도 호출 가능

module.exports = app;

// 직접 실행 시: 포트 결정 → 초기화 완료 후 서버 시작 → 설정 감시 시작
if (require.main === module) {
  (async () => {
    const port = resolvePort();
    try {
      await initReady;
      try {
        await startServer(port);
      } catch (e) {
        console.warn(`[server] port ${port} busy, falling back to random`);
        await startServer(0);
      }
      // ✅ JSON 감시 시작
      watchPortConfig();
    } catch (e) {
      console.error('[server] bootstrap failed:', e);
      process.exit(1);
    }
  })();
}
