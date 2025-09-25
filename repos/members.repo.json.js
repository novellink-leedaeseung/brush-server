// repos/members.repo.json.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');

class JsonMemberRepo {
  #map = new Map();
  #nextId = 1;
  #saveTimer = null;
  #currentDate = null;          // 'YYYY-MM-DD'
  #dateWatchTimer = null;       // 자정 감시 타이머

  // 날짜 포맷 함수 (YYYY-MM-DD) - 한국 시간대 기준
  #getDateString(date = new Date()) {
    const koreaDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const year = koreaDate.getFullYear();
    const month = String(koreaDate.getMonth() + 1).padStart(2, '0');
    const day = String(koreaDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 날짜별 파일 경로 생성
  #getDateFilePath(dateString) {
    return path.join(DATA_DIR, `members_${dateString}.json`);
  }

  // 오늘 날짜 파일 경로 (편의용)
  #getTodayFilePath() {
    const today = this.#getDateString();
    return this.#getDateFilePath(today);
  }

  // 모든 날짜별 파일 목록 가져오기
  async #getAllDateFiles() {
    try {
      const files = await fs.promises.readdir(DATA_DIR);
      return files
        .filter(file => file.startsWith('members_') && file.endsWith('.json'))
        .map(file => {
          const dateMatch = file.match(/members_(\d{4}-\d{2}-\d{2})\.json/);
          return dateMatch ? dateMatch[1] : null;
        })
        .filter(Boolean)
        .sort();
    } catch {
      return [];
    }
  }

  async init() {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const today = this.#getDateString();
    this.#currentDate = today;
    await this.#loadDateData(today);
    this.#startDateWatcher(); // ✅ 자정 자동 전환
  }

  // ✅ 자정 감시 타이머(30초 간격)
  #startDateWatcher() {
    if (this.#dateWatchTimer) clearInterval(this.#dateWatchTimer);
    this.#dateWatchTimer = setInterval(() => {
      this.#ensureTodayNonBlocking();
    }, 30 * 1000);
  }

  // ✅ 비동기 전환을 호출부 막지 않고 수행
  #ensureTodayNonBlocking() {
    const today = this.#getDateString();
    if (this.#currentDate !== today) {
      // fire-and-forget 전환
      this.#loadDateData(today).catch(err => {
        console.error('[DB] date switch failed:', err);
      });
    }
  }

  // 쓰기 전에만 “오늘 날짜” 보장 (blocking)
  async #ensureToday() {
    const today = this.#getDateString();
    if (this.#currentDate !== today) {
      await this.#loadDateData(today);
    }
  }

  // 특정 날짜의 데이터 로드
  async #loadDateData(dateString) {
    const filePath = this.#getDateFilePath(dateString);
    this.#map.clear();
    this.#nextId = 1;

    let seed = [];
    try {
      const txt = await fs.promises.readFile(filePath, 'utf8');
      seed = JSON.parse(txt);
      console.log(`[DB] Loaded ${seed.length} records from ${dateString}`);
    } catch (err) {
      if (err.code === 'ENOENT') { // 파일이 없을 경우
        console.log(`[DB] Creating new file for date: ${dateString}`);
      } else { // 파일이 손상되었거나 다른 오류일 경우
        console.warn(`[DB] File for ${dateString} may be corrupt. Resetting file.`, err.message);
      }
      await fs.promises.writeFile(filePath, '[]', 'utf8');
      seed = []; // 새로 만들었으므로 seed는 비어있음
    }

    seed.forEach((e) => this.#addSeed(e));
    this.#currentDate = dateString;
  }

  // 날짜별 데이터 조회 (외부 API용)
  async getDataByDate(dateString) {
    const filePath = this.#getDateFilePath(dateString);
    try {
      const txt = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(txt);
      return { date: dateString, count: data.length, data };
    } catch {
      return { date: dateString, count: 0, data: [] };
    }
  }

  // 날짜 범위별 데이터 조회
  async getDataByDateRange(startDate, endDate) {
    const allDates = await this.#getAllDateFiles();
    const filtered = allDates.filter(d => d >= startDate && d <= endDate);
    const results = [];
    for (const date of filtered) {
      const dateData = await this.getDataByDate(date);
      results.push(dateData);
    }
    return results;
  }

  // 전체 날짜 목록 반환
  async getAllDates() {
    return await this.#getAllDateFiles();
  }

  // 특정 날짜로 전환 (관리자용)
  async switchToDate(dateString) {
    if (this.#currentDate !== dateString) {
      await this.#loadDateData(dateString);
    }
  }

  // 현재 날짜 확인
  getCurrentDate() {
    return this.#currentDate;
  }

  /* =========================
   * 기존 시그니처 유지 (동기)
   * ========================= */

  list({ page = 1, pageSize = 5, lunchOnly = true } = {}) {
    // 읽기 계열은 호출부를 막지 않음 (자정 전환은 백그라운드에서)
    this.#ensureTodayNonBlocking();

    const rows = [...this.#map.values()];
    const filtered = lunchOnly
      ? rows.filter(r => r.lunch === true || r.lunch === 'true' || r.lunch === 1 || r.lunch === '1')
      : rows;

    const all = filtered.sort((a, b) => a.id - b.id);
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const cur = Math.min(Math.max(1, page), totalPages);
    const items = all.slice((cur - 1) * pageSize, (cur - 1) * pageSize + pageSize);

    return { items, total, page: cur, pageSize, totalPages, currentDate: this.#currentDate };
  }

  getByUserNo(userNo) {
    this.#ensureTodayNonBlocking();

    const no = Number(userNo);
    if (!Number.isFinite(no) || no <= 0) return null;
    for (const row of this.#map.values()) {
      if (Number(row?.userNo) === no) return row || null;
    }
    return null;
  }

  get(id) {
    this.#ensureTodayNonBlocking();
    return this.#map.get(Number(id)) ?? null;
  }

  update(id, patch) {
    this.#ensureTodayNonBlocking();

    const cur = this.get(id);
    if (!cur) return null;
    const row = {
      ...cur, ...patch,
      id: cur.id,
      updatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };
    this.#map.set(cur.id, row);
    this.#persistSoon();
    return row;
  }

  delete(id) {
    this.#ensureTodayNonBlocking();

    const ok = this.#map.delete(Number(id));
    if (ok) this.#persistSoon();
    return ok;
  }

  /* =========================
   * 쓰기(create)는 원래 async → 그대로 유지
   * ========================= */
  async create(data) {
    // 자정 직후에도 "오늘" 파일로 정확히 기록
    await this.#ensureToday();

    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const id = this.#issueId();
    const row = { id, ...data, createdAt: now, updatedAt: now };
    this.#map.set(id, row);
    this.#persistSoon();
    return row;
  }

  // 내부 메서드들
  #addSeed(e) {
    const id = Number(e?.id) > 0 ? Number(e.id) : this.#issueId();
    this.#map.set(id, { ...e, id });
    if (id >= this.#nextId) this.#nextId = id + 1;
  }

  #issueId() {
    return this.#nextId++;
  }

  // 디바운스 + 원자적 저장 (현재 기준 날짜 파일)
  #persistSoon() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(async () => {
      const filePath = this.#getDateFilePath(this.#currentDate || this.#getDateString());
      const arr = [...this.#map.values()];
      const tmp = filePath + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(arr, null, 2), 'utf8');
      await fs.promises.rename(tmp, filePath);
      console.log(`[DB] Saved ${arr.length} records to ${this.#currentDate}`);
    }, 100);
  }
}

module.exports = { JsonMemberRepo };
