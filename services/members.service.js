// services/members.service.js
const { toBool, assertCreateMember, isValidPhone } = require('../core/validate.js');
const { appendMemberToExcel } = require('../utils/excelStore.js'); // (현재는 미사용, 필요 시 활용)
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs-extra');

class MembersService {
    constructor(repo) {
        this.repo = repo;
    }

    list(q) {
        return this.repo.list(q);
    }

    get(id) {
        return this.repo.get(id);
    }

    getUserNo(id) {
        return this.repo.getByUserNo(id);
    }

    getMemberByPhone(phone) {
        return this.repo.getByPhone(phone);
    }

    async create(body) {
        assertCreateMember(body);
        const data = {
            name: String(body.name).trim(),
            phone: String(body.phone).trim(),
            gradeClass: String(body.gradeClass ?? '').trim(),
            userNo: String(body.userNo ?? '').trim(),
            gender: String(body.gender ?? '').trim(),
            lunch: toBool(body.lunch),
        };

        // 엑셀 내보내기는 살짝 지연해서 트리거 (동시성/응답속도 고려)
        setTimeout(() => {
            this.exportToExcel().catch(err => {
                console.error('[exportToExcel] error:', err);
            });
        }, 600);

        return this.repo.create(data);
    }

    update(id, body) {
        if (body?.phone !== undefined && !isValidPhone(body.phone)) {
            throw Object.assign(new Error('휴대폰 번호 형식 오류'), { status: 400 });
        }

        const patch = {};
        if (body?.name !== undefined) patch.name = String(body.name).trim();
        if (body?.phone !== undefined) patch.phone = String(body.phone).trim();
        if (body?.gradeClass !== undefined) patch.gradeClass = String(body.gradeClass).trim();
        if (body?.gender !== undefined) patch.gender = String(body.gender).trim();
        if (body?.lunch !== undefined) patch.lunch = toBool(body.lunch);

        return this.repo.update(id, patch);
    }

    delete(id) {
        return this.repo.delete(id);
    }

    async exportToExcel() {
        // 한국어 날짜 문자열 파서
        function parseKoreanDateString(s) {
            if (!s) return new Date(); // 비어있으면 현재 시각
            // ISO 등 Date가 직접 해석 가능한 경우 우선 시도
            if (!s.includes('오전') && !s.includes('오후')) {
                const d = new Date(s);
                if (!isNaN(d.getTime())) return d;
            }

            // 예: '2025. 9. 18. 오후 3:14:05'
            const parts = s.replace(/\. /g, ' ').replace(/\./g, '').split(' ');
            if (parts.length < 5) return new Date();

            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // 0-indexed
            const day = parseInt(parts[2], 10);

            const timeParts = parts[4].split(':');
            let hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);
            const second = parseInt(timeParts[2], 10);

            if (isNaN(hour) || isNaN(minute) || isNaN(second)) return new Date();

            if (parts[3] === '오후' && hour < 12) hour += 12;
            if (parts[3] === '오전' && hour === 12) hour = 0;

            const resultDate = new Date(year, month, day, hour, minute, second);
            if (isNaN(resultDate.getTime())) return new Date();

            return resultDate;
        }

        // 같은 날인지 비교 (로컬 타임 기준)
        function isSameLocalDate(a, b) {
            return (
                a.getFullYear() === b.getFullYear() &&
                a.getMonth() === b.getMonth() &&
                a.getDate() === b.getDate()
            );
        }

        // 1) 저장된 모든 날짜를 조회
        const allDates = await this.repo.getAllDates();
        if (allDates.length === 0) {
            console.log('No data to export.');
            return { message: 'No data to export.' };
        }

        // 2) 전체 범위를 받아오되…
        const dateRangeData = await this.repo.getDataByDateRange(
            allDates[0],
            allDates[allDates.length - 1]
        );

        // 3) 평탄화
        const allMembers = dateRangeData.flatMap(dailyData => dailyData.data);
        if (allMembers.length === 0) {
            console.log('No members to export.');
            return { message: 'No members to export.' };
        }

        // 4) 오늘(Local) 데이터만 필터링
        const now = new Date();
        const todayMembers = allMembers.filter(member => {
            const d = parseKoreanDateString(member.createdAt);
            return isSameLocalDate(d, now);
        });

        if (todayMembers.length === 0) {
            console.log('No members for today.');
            // 그래도 파일은 “빈 시트”로 생성하고 싶으면 여기서 계속 진행 가능
            return { message: 'No members for today.' };
        }

        // 5) 엑셀 행 포맷
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayString = `${y}-${m}-${day}`;

        const formattedMembers = todayMembers.map(member => {
            const d = parseKoreanDateString(member.createdAt);
            const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

            const [grade = '', aClass = ''] = String(member.gradeClass ?? '').split('-');

            const lunchStatus =
                member.lunch === true ||
                member.lunch === 'true' ||
                member.lunch === 1 ||
                member.lunch === '1'
                    ? 'Y'
                    : 'N';

            return {
                date: todayString,
                time,
                grade,
                class: aClass,
                name: member.name,
                lunch: lunchStatus,
            };
        });

        // 6) 엑셀 작성
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('양치기록');

        worksheet.columns = [
            { header: '날짜', key: 'date', width: 12 },
            { header: '시간', key: 'time', width: 12 },
            { header: '학년', key: 'grade', width: 15 },
            { header: '반', key: 'class', width: 10 },
            { header: '이름', key: 'name', width: 16 },
            { header: '점심시간 여부', key: 'lunch', width: 15 },
        ];

        worksheet.addRows(formattedMembers);

        // 7) 오늘 날짜 파일명으로 저장
        const DATA_DIR = path.join(process.cwd(), 'student', 'excel');
        await fs.ensureDir(DATA_DIR);
        const exportFilePath = path.join(DATA_DIR, `양치기록_${todayString}.xlsx`);
        await workbook.xlsx.writeFile(exportFilePath);

        console.log(`Exported ${formattedMembers.length} members to ${exportFilePath}`);
        return { filePath: exportFilePath, count: formattedMembers.length };
    }
}

module.exports = { MembersService };
