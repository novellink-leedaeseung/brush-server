// repos/members.repo.json.js
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export class JsonMemberRepo {
    #map = new Map();
    #nextId = 1;
    #saveTimer = null;
    #currentDate = null;

    // 날짜 포맷 함수 (YYYY-MM-DD) - 한국 시간대 기준
    #getDateString(date = new Date()) {
        // 한국 시간대 기준으로 날짜만 추출 (시간은 무시)
        const koreaDate = new Date(date.toLocaleString('en-US', {timeZone: 'Asia/Seoul'}));

        const year = koreaDate.getFullYear();
        const month = String(koreaDate.getMonth() + 1).padStart(2, '0');
        const day = String(koreaDate.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    // 날짜별 파일 경로 생성
    #getDateFilePath(dateString) {
        return path.join(DATA_DIR, `members_${dateString}.json`);
    }

    // 오늘 날짜 파일 경로
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
                .filter(date => date !== null)
                .sort(); // 날짜순 정렬
        } catch {
            return [];
        }
    }

    async init() {
        await fs.promises.mkdir(DATA_DIR, {recursive: true});

        // 오늘 날짜로 초기화
        const today = this.#getDateString();
        this.#currentDate = today;

        await this.#loadDateData(today);
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
        } catch {
            // 파일이 없으면 빈 배열로 시작
            await fs.promises.writeFile(filePath, '[]', 'utf8');
            console.log(`[DB] Created new file for ${dateString}`);
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
            return {
                date: dateString,
                count: data.length,
                data: data
            };
        } catch {
            return {
                date: dateString,
                count: 0,
                data: []
            };
        }
    }

    // 날짜 범위별 데이터 조회
    async getDataByDateRange(startDate, endDate) {
        const allDates = await this.#getAllDateFiles();
        const filteredDates = allDates.filter(date =>
            date >= startDate && date <= endDate
        );

        const results = [];
        for (const date of filteredDates) {
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

    // 기존 메서드들 (현재 로드된 날짜 데이터에 대해서만 동작)
    list({page = 1, pageSize = 5, lunchOnly = true} = {}) {
        const rows = [...this.#map.values()];
        const filtered = lunchOnly
            ? rows.filter(r => r.lunch === true || r.lunch === 'true' || r.lunch === 1 || r.lunch === '1')
            : rows;

        const all = filtered.sort((a, b) => a.id - b.id);
        const total = all.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const cur = Math.min(Math.max(1, page), totalPages);
        const items = all.slice((cur - 1) * pageSize, (cur - 1) * pageSize + pageSize);

        return {
            items,
            total,
            page: cur,
            pageSize,
            totalPages,
            currentDate: this.#currentDate
        };
    }

    // UserNo로 조회
    getByUserNo(userNo) {
        const no = Number(userNo);
        if (!Number.isFinite(no) || no <= 0) return null;

        for (const row of this.#map.values()) {
            if (Number(row?.userNo) === no) return row || null;
        }
        return null;
    }


    get(id) {
        return this.#map.get(Number(id)) ?? null;
    }

    create(data) {
        // 오늘 날짜가 아니면 오늘로 전환
        const today = this.#getDateString();
        if (this.#currentDate !== today) {
            this.switchToDate(today);
        }

        const now = new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'});
        const id = this.#issueId();
        const row = {id, ...data, createdAt: now, updatedAt: now};
        this.#map.set(id, row);
        this.#persistSoon();
        return row;
    }

    update(id, patch) {
        const cur = this.get(id);
        if (!cur) return null;
        const row = {
            ...cur, ...patch,
            id: cur.id,
            updatedAt: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})
        };
        this.#map.set(cur.id, row);
        this.#persistSoon();
        return row;
    }

    delete(id) {
        const ok = this.#map.delete(Number(id));
        if (ok) this.#persistSoon();
        return ok;
    }

    // 내부 메서드들
    #addSeed(e) {
        const id = Number(e?.id) > 0 ? Number(e.id) : this.#issueId();
        this.#map.set(id, {...e, id});
        if (id >= this.#nextId) this.#nextId = id + 1;
    }

    #issueId() {
        return this.#nextId++;
    }

    // 💡 디바운스 + 원자적 저장 (현재 날짜 파일에 저장)
    #persistSoon() {
        clearTimeout(this.#saveTimer);
        this.#saveTimer = setTimeout(async () => {
            const filePath = this.#getTodayFilePath();
            const arr = [...this.#map.values()];
            const tmp = filePath + '.tmp';
            await fs.promises.writeFile(tmp, JSON.stringify(arr, null, 2), 'utf8');
            await fs.promises.rename(tmp, filePath);
            console.log(`[DB] Saved ${arr.length} records to ${this.#currentDate}`);
        }, 100); // 100ms 동안 변경 합치기
    }
}
