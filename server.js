const express = require('express');
const path = require('path');
const { Pool } = require('pg');

try {
  process.chdir(__dirname);
} catch (e) {
  console.error('chdir 실패:', e.message);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Neon/local PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Create tables if not exists
async function initDb() {
  const query = `
    CREATE TABLE IF NOT EXISTS work_logs (
      emp_idx INT NOT NULL,
      date_str VARCHAR(10) NOT NULL,
      name VARCHAR(50),
      submitted BOOLEAN DEFAULT false,
      submitted_at TIMESTAMP,
      admin_confirmed BOOLEAN DEFAULT false,
      confirmed_at TIMESTAMP,
      sections JSONB,
      PRIMARY KEY (emp_idx, date_str)
    );
  `;
  try {
    if (process.env.DATABASE_URL) {
      await pool.query(query);
      console.log('Database initialized.');
    } else {
        console.log('No DATABASE_URL found. Skipping DB init.');
    }
  } catch (e) {
    console.error('DB init failed:', e);
  }
}
// don't wait for init on boot, just start it
initDb();

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

app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
     if(process.env.DATABASE_URL) await pool.query('SELECT 1');
     res.json({ ok: true, time: new Date().toISOString(), db: 'connected' });
  } catch(e) {
     res.json({ ok: true, time: new Date().toISOString(), db: 'error' });
  }
});

// ======== HELPERS ========
function isValidLogDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidEmpIdx(n) {
  return Number.isFinite(n) && n >= 1 && n <= MAX_EMP_IDX && n === Math.floor(n);
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

// Transform DB row back to JSON structure
function dbRowToJson(row) {
  return {
    empIdx: row.emp_idx,
    date: row.date_str,
    name: row.name,
    submitted: row.submitted,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
    adminConfirmed: row.admin_confirmed,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : undefined,
    sections: row.sections || { today: [], tomorrow: [], special: [] }
  };
}

// ======== API: Employee list ========
app.get('/api/employees', (req, res) => {
  res.json(EMPLOYEES);
});

// ======== API: Load work log ========
app.get('/api/log/:empIdx/:date', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const empIdx = parseInt(req.params.empIdx, 10);
  const dateStr = req.params.date;
  
  if (!isValidEmpIdx(empIdx) || !isValidLogDate(dateStr)) {
    return res.status(400).json({ error: '잘못된 직원 또는 날짜입니다.' });
  }
  if (!empSlotWritable(empIdx)) {
    return res.status(403).json({ error: '미배정 번호입니다. 작성할 수 없습니다.' });
  }
  
  try {
    const { rows } = await pool.query('SELECT * FROM work_logs WHERE emp_idx = $1 AND date_str = $2', [empIdx, dateStr]);
    if (rows.length > 0) {
      return res.json(dbRowToJson(rows[0]));
    }
    return res.json(null);
  } catch (e) {
    console.error('[api/log GET] DB 오류:', e.message);
    res.status(500).json({ error: '데이터를 읽는 중 오류가 났습니다.' });
  }
});

// ======== API: Save work log ========
app.post('/api/log/:empIdx/:date', async (req, res) => {
  const empIdx = parseInt(req.params.empIdx, 10);
  const dateStr = req.params.date;
  if (!isValidEmpIdx(empIdx) || !isValidLogDate(dateStr)) {
    return res.status(400).json({ error: '잘못된 직원 또는 날짜입니다.' });
  }
  if (!empSlotWritable(empIdx)) {
    return res.status(403).json({ error: '미배정 번호에는 저장할 수 없습니다.' });
  }
  
  const incoming = req.body && typeof req.body === 'object' ? req.body : {};
  const sections = incoming.sections || { today: [], tomorrow: [], special: [] };
  const name = getEmpName(empIdx);

  try {
    // Check if exists to preserve submitted/confirmed status
    let submitted = false;
    let submittedAt = null;
    let adminConfirmed = false;
    let confirmedAt = null;

    const { rows } = await pool.query('SELECT submitted, submitted_at, admin_confirmed, confirmed_at FROM work_logs WHERE emp_idx = $1 AND date_str = $2', [empIdx, dateStr]);
    if (rows.length > 0) {
      if (rows[0].submitted === true) {
        submitted = true;
        submittedAt = rows[0].submitted_at;
      }
      if (rows[0].admin_confirmed === true) {
        adminConfirmed = true;
        confirmedAt = rows[0].confirmed_at;
      }
    }

    const query = `
      INSERT INTO work_logs (emp_idx, date_str, name, submitted, submitted_at, admin_confirmed, confirmed_at, sections)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (emp_idx, date_str) DO UPDATE SET
        name = EXCLUDED.name,
        submitted = EXCLUDED.submitted,
        submitted_at = EXCLUDED.submitted_at,
        admin_confirmed = EXCLUDED.admin_confirmed,
        confirmed_at = EXCLUDED.confirmed_at,
        sections = EXCLUDED.sections
    `;
    await pool.query(query, [empIdx, dateStr, name, submitted, submittedAt, adminConfirmed, confirmedAt, JSON.stringify(sections)]);
    res.json({ ok: true });
  } catch(e) {
    console.error('[api/log POST]', e);
    res.status(500).json({ error: '저장 실패' });
  }
});

// ======== API: Submit work log ========
app.post('/api/submit/:empIdx/:date', async (req, res) => {
  const empIdx = parseInt(req.params.empIdx, 10);
  const dateStr = req.params.date;
  if (!empSlotWritable(empIdx)) {
    return res.status(403).json({ error: '미배정 번호는 제출할 수 없습니다.' });
  }
  
  try {
    const { rows } = await pool.query('SELECT * FROM work_logs WHERE emp_idx = $1 AND date_str = $2', [empIdx, dateStr]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '저장된 데이터가 없습니다.' });
    }
    const data = dbRowToJson(rows[0]);
    const submittedAt = new Date().toISOString();
    
    await pool.query('UPDATE work_logs SET submitted = true, submitted_at = $1 WHERE emp_idx = $2 AND date_str = $3', [submittedAt, empIdx, dateStr]);

    // Auto carry-over
    const unchecked = (data.sections?.today || []).filter(item => !item.done && item.content);
    if (unchecked.length > 0) {
      const nextDate = getNextDate(dateStr);
      let nextDataSections = { today: [], tomorrow: [], special: [] };
      const nextRows = await pool.query('SELECT sections FROM work_logs WHERE emp_idx = $1 AND date_str = $2', [empIdx, nextDate]);
      if (nextRows.rows.length > 0) {
        nextDataSections = nextRows.rows[0].sections;
      }
      
      const carried = unchecked.map(item => ({
        ...item,
        id: 'carry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        done: false,
        carried: true
      }));
      
      nextDataSections.today = [...carried, ...(nextDataSections.today || [])];
      
      const upsertQuery = `
        INSERT INTO work_logs (emp_idx, date_str, name, submitted, admin_confirmed, sections)
        VALUES ($1, $2, $3, false, false, $4)
        ON CONFLICT (emp_idx, date_str) DO UPDATE SET
          sections = EXCLUDED.sections
      `;
      await pool.query(upsertQuery, [empIdx, nextDate, getEmpName(empIdx), JSON.stringify(nextDataSections)]);
    }

    res.json({ ok: true, carriedOver: unchecked.length });
  } catch(e) {
    console.error('[api/submit POST]', e);
    res.status(500).json({ error: '제출 오류' });
  }
});

// ======== API: Admin 확인 / 확인 취소 (토글) ========
app.post('/api/confirm/:empIdx/:date', async (req, res) => {
  const empIdx = parseInt(req.params.empIdx, 10);
  const dateStr = req.params.date;
  try {
    const { rows } = await pool.query('SELECT * FROM work_logs WHERE emp_idx = $1 AND date_str = $2', [empIdx, dateStr]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '데이터가 없습니다.' });
    }
    const data = dbRowToJson(rows[0]);
    if (!data.submitted) {
      return res.status(400).json({ error: '제출된 일지만 확인할 수 있습니다.' });
    }
    
    const wasConfirmed = !!data.adminConfirmed;
    const newConfirmed = !wasConfirmed;
    const confirmedAt = newConfirmed ? new Date().toISOString() : null;
    
    await pool.query('UPDATE work_logs SET admin_confirmed = $1, confirmed_at = $2 WHERE emp_idx = $3 AND date_str = $4', [newConfirmed, confirmedAt, empIdx, dateStr]);
    
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, adminConfirmed: newConfirmed });
  } catch(e) {
    console.error('[api/confirm POST]', e);
    res.status(500).json({ error: '데이터 변경 중 오류' });
  }
});

// ======== API: Admin 반송 (Return/Reject) ========
app.post('/api/reject/:empIdx/:date', async (req, res) => {
  const empIdx = parseInt(req.params.empIdx, 10);
  const dateStr = req.params.date;
  try {
    const { rows } = await pool.query('SELECT * FROM work_logs WHERE emp_idx = $1 AND date_str = $2', [empIdx, dateStr]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '데이터가 없습니다.' });
    }
    
    // Set submitted and admin_confirmed to false
    await pool.query('UPDATE work_logs SET submitted = false, submitted_at = null, admin_confirmed = false, confirmed_at = null WHERE emp_idx = $1 AND date_str = $2', [empIdx, dateStr]);
    
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true });
  } catch(e) {
    console.error('[api/reject POST]', e);
    res.status(500).json({ error: '데이터 변경 중 오류' });
  }
});

// ======== API: Admin cards (all submitted for a date) ========
app.get('/api/admin/cards/:date', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const { date } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM work_logs WHERE date_str = $1 AND submitted = true ORDER BY emp_idx ASC', [date]);
    const cards = rows.map(r => {
      const data = dbRowToJson(r);
      const emp = getEmpRecord(data.empIdx);
      if(emp) {
        data.name = emp.active && emp.name ? emp.name : (data.name || `#${emp.idx}`);
      }
      return data;
    });
    res.json(cards);
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'DB 조회 실패' });
  }
});

// ======== API: Weekly stats ========
app.get('/api/weekly-stats/:startDate/:endDate', async (req, res) => {
  const { startDate, endDate } = req.params;
  const employees = {};
  const suggestions = [];

  for (const emp of EMPLOYEES) {
    const dispName = emp.active && emp.name ? emp.name : '';
    employees[emp.idx] = {
      empIdx: emp.idx, name: dispName, active: emp.active,
      totalItems: 0, doneItems: 0, undoneItems: 0,
      starItems: 0, suggestions: 0, days: 0, submittedDays: 0,
      importantItems: [], dailyDetails: []
    };
  }

  try {
    const { rows } = await pool.query('SELECT * FROM work_logs WHERE date_str >= $1 AND date_str <= $2 ORDER BY emp_idx, date_str', [startDate, endDate]);
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const allDates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
    }
    
    for (const dateStr of allDates) {
      for (const emp of EMPLOYEES) {
        const row = rows.find(r => r.emp_idx === emp.idx && r.date_str === dateStr);
        if (!row) continue;
        
        const data = dbRowToJson(row);
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
    
    const empList = Object.values(employees).sort((a, b) => a.empIdx - b.empIdx);
    res.json({ employees: empList, suggestions });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: '통계 DB 조회 실패' });
  }
});

// ======== API: Weekly detail for single employee ========
app.get('/api/weekly-detail/:empIdx/:startDate/:endDate', async (req, res) => {
  const { empIdx, startDate, endDate } = req.params;
  const ei = parseInt(empIdx, 10);
  if (!isValidEmpIdx(ei)) return res.json([]);
  
  try {
    const { rows } = await pool.query('SELECT * FROM work_logs WHERE emp_idx = $1 AND date_str >= $2 AND date_str <= $3 ORDER BY date_str ASC', [ei, startDate, endDate]);
    const days = rows.map(r => {
      const d = dbRowToJson(r);
      d.name = getEmpName(ei);
      return d;
    });
    res.json(days);
  } catch(e) {
    console.error(e);
    res.status(500).json([]);
  }
});

app.get('/manifest.json', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ==== Vercel & Local Start Logic ====
// Export app for Vercel
module.exports = app;

// Start listener only if not on Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  function printListenBanner(hostLabel) {
    console.log(`\n========================================`);
    console.log(`  계약관리팀 업무일지 서버 시작`);
    console.log(`  로컬: http://127.0.0.1:${PORT}  또는  http://localhost:${PORT}`);
    console.log(`  상태 확인: http://127.0.0.1:${PORT}/api/health`);
    if (hostLabel) console.log(`  바인딩: ${hostLabel} (환경 변수 HOST)`);
    else console.log(`  바인딩: 기본(IPv4/IPv6 — localhost 연결 문제 완화)`);
    console.log(`  다른 PC에서 접속 시: http://<이 PC의 IP>:${PORT}`);
    console.log(`========================================\n`);
  }

  const listenHost = process.env.HOST;
  const server = listenHost
    ? app.listen(PORT, listenHost, () => printListenBanner(listenHost))
    : app.listen(PORT, () => printListenBanner(''));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`포트 ${PORT}이(가) 이미 사용 중입니다.`);
    } else {
      console.error('서버 시작 오류:', err.message);
    }
    process.exit(1);
  });
}
