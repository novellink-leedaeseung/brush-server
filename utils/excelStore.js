import path from "path";
import fs from "fs-extra";
import ExcelJS from "exceljs";
import { Mutex } from "async-mutex";

const mutex = new Mutex();
const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "members.xlsx");
const BACKUP_PATH = path.join(DATA_DIR, "members_backup.xlsx");

// 오늘 날짜를 시트 이름으로 (예: 2025-09-16)
function getTodaySheetName() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 파일 백업 생성
async function createBackup() {
  if (await fs.pathExists(FILE_PATH)) {
    await fs.copy(FILE_PATH, BACKUP_PATH);
  }
}

// 워크북 로드/생성
async function ensureWorkbook() {
  await fs.ensureDir(DATA_DIR);
  const wb = new ExcelJS.Workbook();

  if (await fs.pathExists(FILE_PATH)) {
    await wb.xlsx.readFile(FILE_PATH);
  }

  const todaySheet = getTodaySheetName();
  let ws = wb.getWorksheet(todaySheet);

  if (!ws) {
    ws = wb.addWorksheet(todaySheet);
    ws.columns = [
      { header: "timestamp", key: "timestamp", width: 22 },
      { header: "name", key: "name", width: 16 },
      { header: "phone", key: "phone", width: 16 },
      { header: "gradeClass", key: "gradeClass", width: 12 },
      { header: "gender", key: "gender", width: 8 },
    ];
  }

  return { wb, ws, sheetName: todaySheet };
}

// 학생 데이터 한 줄 추가
export async function appendMemberToExcel(row) {
  return mutex.runExclusive(async () => {
    try {
      await createBackup();

      const { wb, ws, sheetName } = await ensureWorkbook();

      const newRowData = {
        timestamp: new Date().toISOString(),
        name: row.name ?? "",
        phone: row.phone ?? "",
        gradeClass: row.gradeClass ?? "",
        gender: row.gender ?? "",
      };

      ws.addRow(newRowData);

      // 임시 파일로 저장 후 교체
      const tempPath = path.join(DATA_DIR, "members_temp.xlsx");
      await wb.xlsx.writeFile(tempPath);
      await fs.move(tempPath, FILE_PATH, { overwrite: true });

      return { filePath: FILE_PATH, sheet: sheetName };
    } catch (error) {
      if (await fs.pathExists(BACKUP_PATH)) {
        await fs.copy(BACKUP_PATH, FILE_PATH, { overwrite: true });
      }
      throw error;
    }
  });
}
