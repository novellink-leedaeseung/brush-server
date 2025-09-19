// services/members.service.js
import {toBool, assertCreateMember, isValidPhone} from '../core/validate.js';
import {appendMemberToExcel} from '../utils/excelStore.js';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs-extra';

export class MembersService {
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
        setTimeout(() => {
            this.exportToExcel();
        }, 600);
        return this.repo.create(data);
    }

    update(id, body) {
        if (body?.phone !== undefined && !isValidPhone(body.phone))
            throw Object.assign(new Error('휴대폰 번호 형식 오류'), {status: 400});

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
        // Helper function to parse Korean date strings
        function parseKoreanDateString(s) {
            if (!s) return new Date(); // Return current date if string is empty
            // Check for ISO format or other formats new Date() can handle
            if (!s.includes('오전') && !s.includes('오후')) {
                const d = new Date(s);
                if (!isNaN(d.getTime())) return d;
            }

            // Handle Korean format like '2025. 9. 18. 오후 3:14:05'
            const parts = s.replace(/\. /g, ' ').replace(/\./g, '').split(' ');
            if (parts.length < 5) return new Date(); // Return current date on parse error

            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
            const day = parseInt(parts[2], 10);

            const timeParts = parts[4].split(':');
            let hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);
            const second = parseInt(timeParts[2], 10);

            if (isNaN(hour) || isNaN(minute) || isNaN(second)) return new Date();

            if (parts[3] === '오후' && hour < 12) {
                hour += 12;
            }
            if (parts[3] === '오전' && hour === 12) { // Handle 12 AM (midnight)
                hour = 0;
            }
            
            const resultDate = new Date(year, month, day, hour, minute, second);
            if (isNaN(resultDate.getTime())) return new Date(); // Final check

            return resultDate;
        }

        // 1. Get all dates from the repo
        const allDates = await this.repo.getAllDates();
        if (allDates.length === 0) {
            console.log('No data to export.');
            return {message: 'No data to export.'};
        }

        // 2. Get data for the entire date range
        const dateRangeData = await this.repo.getDataByDateRange(allDates[0], allDates[allDates.length - 1]);

        // 3. Consolidate all members into a single array
        const allMembers = dateRangeData.flatMap(dailyData => dailyData.data);

        if (allMembers.length === 0) {
            console.log('No members to export.');
            return {message: 'No members to export.'};
        }

        // 4. Format data to match new columns
        const formattedMembers = allMembers.map(member => {
            const d = parseKoreanDateString(member.createdAt);
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

            const grade = member.gradeClass.split('-')[0] ?? '';
            const aClass = member.gradeClass.split('-')[1] ?? '';
            // 점심시간 여부 O,X
            const lunchStatus = (member.lunch === true || member.lunch === 'true' || member.lunch === 1 || member.lunch === '1') ? 'Y' : 'N';

            return {
                date: date,
                time: time,
                grade: grade,
                class: aClass,
                name: member.name,
                lunch: lunchStatus
            };
        });

        // 5. Write to Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('양치기록');

        worksheet.columns = [
            {header: '날짜', key: 'date', width: 12},
            {header: '시간', key: 'time', width: 12},
            {header: '학년', key: 'grade', width: 15},
            {header: '반', key: 'class', width: 10},
            {header: '이름', key: 'name', width: 16},
            {header: '점심시간 여부', key: 'lunch', width: 15},
        ];

        worksheet.addRows(formattedMembers);

        // 6. Save the file with today's date
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const todayString = `${y}-${m}-${day}`;

        const DATA_DIR = path.join(process.cwd(), 'data');
        await fs.ensureDir(DATA_DIR);
        const exportFilePath = path.join(DATA_DIR, `양치기록_${todayString}.xlsx`);
        await workbook.xlsx.writeFile(exportFilePath);

        console.log(`Exported ${formattedMembers.length} members to ${exportFilePath}`);
        return {filePath: exportFilePath, count: formattedMembers.length};
    }
}
