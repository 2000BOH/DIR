const express = require('express');
const fs = require('fs');
const path = require('path');

// 네트워크 경로(UNC)에서도 작업 디렉터리를 프로젝트 루트로 고정
try {
  process.chdir(__dirname);
} catch (e) {
  console.error('chdir 실패:', e.message);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_PASSWORD = '1234';

// 직원 번호(1~10)는 고정, 파일명 emp{번호}_{날짜}.json — 인원 충원 시 해당 idx만 name·active 수정
// active:false 이거나 name이 비어 있으면 작성·저장 불가(데이터 파일은 번호별로 유지)
const EMPLOYEES = [
  { idx: 1, name: '남식', active: true },
  { idx: 2, name: '수용', active: true },
  { idx: 3, name: '', active: false },
  { idx: 4, name: '은정', active: true },
  { idx: 5, name: '아름', active: true },
  { idx: 6, name: '동훈', active: true },
  { idx: 7, name: '시우', active: true },
  { idx: 8, name: '현석', active: true },
  { idx: 9, name: '', active: false },
  { idx: 10, name: '', active: false },
];

const MAX_EMP_IDX = 10;

function getEmpRecord(idx) {
  return EMPLOYEES.find(x => x.idx === parseInt(idx, 10));
}

function empSlotWritable(idx) {
  const e = getEmpRecord(idx);
  return !!(e && e.active && String(e.name || '').trim());
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, time: new Date().toISOString() });
});

// ======== MIGRATION: name-based files → index-based ========
function migrateOldFiles() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    // Skip already migrated files (emp1_date.json pattern)
    if (/^emp\d+_/.test(file)) continue;
    // Try to match old pattern: name_date.json
    const match = file.match(/^(.+)_(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) continue;
    const oldName = match[1];
    const date = match[2];
    const emp = EMPLOYEES.find(e => e.name === oldName);
    if (emp) {
      const newFile = `emp${emp.idx}_${date}.json`;
      const oldPath = path.join(DATA_DIR, file);
      const newPath = path.join(DATA_DIR, newFile);
      if (!fs.existsSync(newPath)) {
        const data = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
        data.empIdx = emp.idx;
        data.name = emp.name;
        fs.writeFileSync(newPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Migrated: ${file} → ${newFile}`);
      }
    }
  }
}
try {
  migrateOldFiles();
} catch (e) {
  console.error('[경고] 데이터 마이그레이션 중 오류(서버는 계속 시작합니다):', e.message);
}

// ======== HELPERS ========
function isValidLogDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidEmpIdx(n) {
  return Number.isFinite(n) && n >= 1 && n <= MAX_EMP_IDX && n === Math.floor(n);
}

function getFilePath(empIdx, date) {
  return path.join(DATA_DIR, `emp${empIdx}_${date}.json`);
}

function getNextDate(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getEmpName(idx) {
  const e = getEmpRecord(idx);
  if (!e) return `직원${idx}`;
  if (e.active && String(e.name || '').trim()) return e.name.trim();
  return `직원${idx}`;
}

// ======== API: Employee list ========
app.get('/api/employees', (req, res) => {
  res.json(EMPLOYEES);
});

// ======== API: Load work log ========
app.get('/api/log/:empIdx/:date', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const empIdx = parseInt(req.params.empIdx, 10);
  const date = req.params.date;
  if (!isValidEmpIdx(empIdx) || !isValidLogDate(date)) {
    return res.status(400).json({ error: '잘못된 직원 또는 날짜입니다.' });
  }
  if (!empSlotWritable(empIdx)) {
    return res.status(403).json({ error: '미배정 번호입니다. 작성할 수 없습니다.' });
  }
  const filePath = getFilePath(empIdx, date);
  if (fs.existsSync(filePath)) {
    try {
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (e) {
      console.error('[api/log GET] JSON 오류:', filePath, e.message);
      res.status(500).json({ error: '파일을 읽는 중 오류가 났습니다.' });
    }
    return;
  }
  const legacyName = getEmpName(empIdx);
  const legacyPath = path.join(DATA_DIR, `${legacyName}_${date}.json`);
  if (fs.existsSync(legacyPath)) {
    try {
      res.json(JSON.parse(fs.readFileSync(legacyPath, 'utf8')));
    } catch (e) {
      console.error('[api/log GET] 구파일 JSON 오류:', legacyPath, e.message);
      res.json(null);
    }
    return;
  }
  res.json(null);
});

// ======== API: Save work log ========
app.post('/api/log/:empIdx/:date', (req, res) => {
  const empIdx = parseInt(req.params.empIdx, 10);
  const date = req.params.date;
  if (!isValidEmpIdx(empIdx) || !isValidLogDate(date)) {
    return res.status(400).json({ error: '잘못된 직원 또는 날짜입니다.' });
  }
  if (!empSlotWritable(empIdx)) {
    return res.status(403).json({ error: '미배정 번호에는 저장할 수 없습니다.' });
  }
  const filePath = getFilePath(empIdx, date);
  const incoming = req.body && typeof req.body === 'object' ? req.body : {};
  const merged = {
    ...incoming,
    empIdx,
    name: getEmpName(empIdx),
    date
  };
  // 제출·확인 상태는 디스크 기준(직원 JSON에 없을 수 있음). 확인 취소 후에도 클라이언트가 true로 덮어쓰지 않음.
  if (fs.existsSync(filePath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (prev.submitted === true || prev.submitted === 'true') {
        merged.submitted = true;
        if (prev.submittedAt) merged.submittedAt = prev.submittedAt;
      }
      const prevConfirmed = prev.adminConfirmed === true || prev.adminConfirmed === 'true';
      merged.adminConfirmed = prevConfirmed;
      if (merged.adminConfirmed && prev.confirmedAt) merged.confirmedAt = prev.confirmedAt;
      else delete merged.confirmedAt;
    } catch (e) {
      console.error('[api/log] 기존 파일 병합 실패:', e.message);
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
  res.json({ ok: true });
});

// ======== API: Submit work log ========
app.post('/api/submit/:empIdx/:date', (req, res) => {
  const empIdx = parseInt(req.params.empIdx, 10);
  const date = req.params.date;
  if (!empSlotWritable(empIdx)) {
    return res.status(403).json({ error: '미배정 번호는 제출할 수 없습니다.' });
  }
  const filePath = getFilePath(empIdx, date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '저장된 데이터가 없습니다.' });
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.submitted = true;
  data.submittedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

  // Auto carry-over unchecked today items to next day
  const unchecked = (data.sections?.today || []).filter(item => !item.done && item.content);
  if (unchecked.length > 0) {
    const nextDate = getNextDate(date);
    const nextFilePath = getFilePath(empIdx, nextDate);
    let nextData;
    if (fs.existsSync(nextFilePath)) {
      nextData = JSON.parse(fs.readFileSync(nextFilePath, 'utf8'));
    } else {
      nextData = {
        empIdx, name: getEmpName(empIdx), date: nextDate,
        submitted: false, adminConfirmed: false,
        sections: { today: [], tomorrow: [], special: [] }
      };
    }
    const carried = unchecked.map(item => ({
      ...item,
      id: 'carry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      done: false,
      carried: true
    }));
    nextData.sections.today = [...carried, ...(nextData.sections.today || [])];
    fs.writeFileSync(nextFilePath, JSON.stringify(nextData, null, 2), 'utf8');
  }

  res.json({ ok: true, carriedOver: unchecked.length });
});

// ======== API: Admin 확인 / 확인 취소 (토글) ========
app.post('/api/confirm/:empIdx/:date', (req, res) => {
  const empIdx = parseInt(req.params.empIdx, 10);
  const date = req.params.date;
  const filePath = getFilePath(empIdx, date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '데이터가 없습니다.' });
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const submitted = data.submitted === true || data.submitted === 'true';
  if (!submitted) {
    return res.status(400).json({ error: '제출된 일지만 확인할 수 있습니다.' });
  }
  const wasConfirmed = data.adminConfirmed === true || data.adminConfirmed === 'true';
  if (wasConfirmed) {
    data.adminConfirmed = false;
    delete data.confirmedAt;
  } else {
    data.adminConfirmed = true;
    data.confirmedAt = new Date().toISOString();
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, adminConfirmed: data.adminConfirmed });
});

// ======== API: Admin cards (all submitted for a date) ========
app.get('/api/admin/cards/:date', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const { date } = req.params;
  const cards = [];
  for (const emp of EMPLOYEES) {
    const filePath = getFilePath(emp.idx, date);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.submitted === true || data.submitted === 'true') {
        data.name = emp.active && emp.name ? emp.name : (data.name || `#${emp.idx}`);
        data.empIdx = emp.idx;
        if (!data.date) data.date = date;
        cards.push(data);
      }
    }
  }
  cards.sort((a, b) => a.empIdx - b.empIdx);
  res.json(cards);
});

// ======== API: Weekly stats ========
app.get('/api/weekly-stats/:startDate/:endDate', (req, res) => {
  const { startDate, endDate } = req.params;
  const employees = {};
  const suggestions = [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const emp of EMPLOYEES) {
    const dispName = emp.active && emp.name ? emp.name : '';
    employees[emp.idx] = {
      empIdx: emp.idx, name: dispName, active: emp.active,
      totalItems: 0, doneItems: 0, undoneItems: 0,
      starItems: 0, suggestions: 0, days: 0, submittedDays: 0,
      importantItems: [], dailyDetails: []
    };
  }

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    for (const emp of EMPLOYEES) {
      const filePath = getFilePath(emp.idx, dateStr);
      if (!fs.existsSync(filePath)) continue;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const e = employees[emp.idx];
      e.days++;
      if (data.submitted) e.submittedDays++;

      const todayItems = data.sections?.today || [];
      const tomorrowItems = data.sections?.tomorrow || [];
      const specialItems = data.sections?.special || [];
      const allItems = [...todayItems, ...tomorrowItems];

      e.totalItems += allItems.length;
      e.doneItems += allItems.filter(i => i.done).length;
      e.undoneItems += allItems.filter(i => !i.done).length;
      e.starItems += allItems.filter(i => i.stars >= 3).length;
      e.suggestions += specialItems.filter(i => i.content).length;

      allItems.filter(i => i.stars >= 3).forEach(i => {
        e.importantItems.push({
          date: dateStr, content: i.content, category: i.category,
          done: i.done, section: todayItems.includes(i) ? '오늘' : '내일'
        });
      });

      e.dailyDetails.push({
        date: dateStr, submitted: data.submitted, confirmed: data.adminConfirmed,
        today: todayItems, tomorrow: tomorrowItems, special: specialItems
      });

      specialItems.forEach(s => {
        if (s.content) {
          const nm = emp.active && emp.name ? emp.name : `#${emp.idx}`;
          suggestions.push({ name: nm, empIdx: emp.idx, date: dateStr, content: s.content });
        }
      });
    }
  }

  // Return ALL employees (including those with no data)
  const empList = Object.values(employees);
  empList.sort((a, b) => a.empIdx - b.empIdx);
  res.json({ employees: empList, suggestions });
});

// ======== API: Weekly detail for single employee ========
app.get('/api/weekly-detail/:empIdx/:startDate/:endDate', (req, res) => {
  const { empIdx, startDate, endDate } = req.params;
  const ei = parseInt(empIdx, 10);
  if (!isValidEmpIdx(ei)) return res.json([]);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const filePath = getFilePath(ei, dateStr);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.name = getEmpName(ei);
      days.push(data);
    }
  }
  res.json(days);
});

app.get('/manifest.json', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.use(express.static(path.join(__dirname, 'public')));

function printListenBanner(hostLabel) {
  console.log(`\n========================================`);
  console.log(`  계약관리팀 업무일지 서버 시작`);
  console.log(`  로컬: http://127.0.0.1:${PORT}  또는  http://localhost:${PORT}`);
  console.log(`  상태 확인: http://127.0.0.1:${PORT}/api/health`);
  if (hostLabel) console.log(`  바인딩: ${hostLabel} (환경 변수 HOST)`);
  else console.log(`  바인딩: 기본(IPv4/IPv6 — localhost 연결 문제 완화)`);
  console.log(`  다른 PC에서 접속 시: http://<이 PC의 IP>:${PORT}`);
  console.log(`  (LAN 공유: start-web-share.bat 또는 환경 변수 HOST=0.0.0.0)`);
  console.log(`========================================\n`);
}

const listenHost = process.env.HOST;
const server = listenHost
  ? app.listen(PORT, listenHost, () => printListenBanner(listenHost))
  : app.listen(PORT, () => printListenBanner(''));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`포트 ${PORT}이(가) 이미 사용 중입니다. 다른 프로그램을 종료하거나 PORT 환경 변수로 다른 포트를 지정하세요.`);
  } else {
    console.error('서버 시작 오류:', err.message);
  }
  process.exit(1);
});
