const { Pool } = require('pg');

// =========================================================================
// ⚠️ 여기에 두 데이터베이스의 접속 주소(Connection String)를 붙여넣으세요.
// =========================================================================

// 기존 Neon DB 주소
// (Vercel 대시보드 - DIR-1 프로젝트 - Settings - Environment Variables 의 DATABASE_URL 값)
const NEON_DB_URL = "postgresql://neondb_owner:npg_9P4YmOpscKuW@ep-small-frost-a1yd8f6e-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// 새 Supabase DB 주소
// (Supabase 대시보드 - 프로젝트 선택 - Project Settings - Database - Connection string (URI) 값)
// 새 Supabase 주소 (비밀번호의 '@' 기호는 오류 방지를 위해 '%40'으로 변환됨)
const SUPABASE_DB_URL = "postgresql://postgres.zbtnbnmkxpkemsegqzcp:boh2398!!%40%40@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres";

// =========================================================================

async function migrate() {


  const oldPool = new Pool({
    connectionString: NEON_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  const newPool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('1. 기존 Neon DB에 연결 중...');
    const { rows } = await oldPool.query('SELECT * FROM work_logs');
    console.log(`=> 총 ${rows.length}개의 데이터를 찾았습니다.`);

    console.log('\n2. 새로운 Supabase DB에 테이블 생성 중...');
    const createTableQuery = `
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
    await newPool.query(createTableQuery);

    console.log('\n3. 데이터 복사(Insert) 시작...');
    let successCount = 0;

    for (const row of rows) {
      const insertQuery = `
        INSERT INTO work_logs (emp_idx, date_str, name, submitted, submitted_at, admin_confirmed, confirmed_at, sections)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (emp_idx, date_str) DO NOTHING
      `;
      const values = [
        row.emp_idx,
        row.date_str,
        row.name,
        row.submitted,
        row.submitted_at,
        row.admin_confirmed,
        row.confirmed_at,
        JSON.stringify(row.sections) // JSONB 컬럼 처리를 위해 문자열화
      ];

      await newPool.query(insertQuery, values);
      successCount++;
    }

    console.log(`\n✅ 마이그레이션 완료! 총 ${successCount}건의 데이터를 안전하게 복사했습니다.`);

  } catch (err) {
    console.error('\n❌ 마이그레이션 중 오류 발생:', err);
  } finally {
    await oldPool.end();
    await newPool.end();
    console.log('프로세스 종료.');
  }
}

migrate();
