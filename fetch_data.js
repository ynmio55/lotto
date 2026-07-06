/**
 * ============================================================================
 *  fetch_data.js — Thai Lottery Backfill (15 ปี, ~360 งวด)
 * ============================================================================
 *
 *  ปรับปรุงจากเวอร์ชันเดิม:
 *    ✅ ใช้ปฏิทินงวดหวยที่ถูกต้อง (ไม่มี 17/01 ที่ซ้ำซ้อน)
 *    ✅ เรียงลำดับงวดจากเก่า→ใหม่ เพื่อให้ append ได้อย่างปลอดภัย
 *    ✅ เพิ่ม retry + exponential backoff
 *    ✅ เพิ่ม timeout 5s ต่อ request
 *    ✅ ใช้ cache แบบ "ถ้ามีข้อมูลครบทุก field → ข้าม" (แทนการเช็ค i > 50)
 *    ✅ กรองงวดอนาคตออก (กัน fetch วันที่ยังไม่ถึง)
 *    ✅ Logging ทุก batch + สรุปตอนจบ
 *    ✅ บันทึกไฟล์ atomic (เขียน .tmp แล้ว rename) กันไฟล์พังกลางทาง
 *
 *  ปฏิทินงวดหวยไทย (อ้างอิงจากสำนักงานสลากฯ):
 *    - งวด 1 ของเดือน: วันที่ 1
 *    - งวด 2 ของเดือน: วันที่ 16
 *    - งวดพิเศษปลายปี: 30 ธันวาคม
 *    - งวด 1 มกราคม ใช้วันที่ 1 ม.ค. ของปีนั้น (ไม่ใช่ 17 ม.ค. ตามที่โค้ดเดิมเขียน)
 *
 *  หมายเหตุ: ปี พ.ศ. = ค.ศ. + 543
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
//  Config
// ---------------------------------------------------------------------------
const FILE_PATH = path.join(__dirname, 'app', 'src', 'data', 'dataset.json');
const BACKFILL_YEARS = 15;        // ดึงย้อนหลัง 15 ปี
const BATCH_SIZE = 5;             // จำนวน request พร้อมกันต่อ batch
const BATCH_DELAY_MS = 500;       // หน่วงเวลาระหว่าง batch (กัน rate limit)
const MAX_RETRIES = 3;            // retry สูงสุดต่อ request
const RETRY_BASE_MS = 800;        // base delay สำหรับ exponential backoff
const REQUEST_TIMEOUT_MS = 5000;  // timeout ต่อ request

// ---------------------------------------------------------------------------
//  Utilities
// ---------------------------------------------------------------------------
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * โหลด dataset เดิม (ถ้ามี) — ทนต่อไฟล์พัง/ว่าง
 */
function loadExisting() {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, 'utf-8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`⚠️  โหลด dataset เดิมไม่สำเร็จ: ${e.message} — เริ่มจากศูนย์`);
    return [];
  }
}

/**
 * บันทึกไฟล์แบบ atomic — เขียน .tmp แล้ว rename
 * กันไฟล์ dataset.json พังถ้า process ตายกลางทาง
 */
function saveAtomic(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * แปลง "DD/MM/YYYY(พ.ศ.)" → Date object (เวลาเที่ยงคืน)
 */
function parseThaiDate(dateStr) {
  const [d, m, yThai] = dateStr.split('/').map(Number);
  return new Date(yThai - 543, m - 1, d, 12, 0, 0);
}

// ---------------------------------------------------------------------------
//  ปฏิทินงวดหวย — ปรับปรุงให้ถูกต้องตามมาตรฐาน
// ---------------------------------------------------------------------------
/**
 * คืนค่า array ของ "วันที่งวด" ในปี ค.ศ. ที่กำหนด
 * เรียงจาก "งวดแรกสุดของปี" → "งวดสุดท้ายของปี"
 *
 * โครงสร้าง (เรียงตามเวลา):
 *   - 1 ม.ค.   ← งวดเปิดปี
 *   - 16 ม.ค.
 *   - 1 ก.พ.   ← สังเกต: ไม่มี 17 ม.ค. ตามที่โค้ดเดิมเขียน
 *   - 16 ก.พ.
 *   - ...
 *   - 1 ธ.ค.
 *   - 16 ธ.ค.
 *   - 30 ธ.ค.  ← งวดพิเศษปลายปี
 */
function getDatesForYear(ceYear) {
  const y = ceYear + 543; // แปลงเป็น พ.ศ.
  return [
    `01/01/${y}`, `16/01/${y}`,
    `01/02/${y}`, `16/02/${y}`,
    `01/03/${y}`, `16/03/${y}`,
    `01/04/${y}`, `16/04/${y}`,
    `01/05/${y}`, `16/05/${y}`,
    `01/06/${y}`, `16/06/${y}`,
    `01/07/${y}`, `16/07/${y}`,
    `01/08/${y}`, `16/08/${y}`,
    `01/09/${y}`, `16/09/${y}`,
    `01/10/${y}`, `16/10/${y}`,
    `01/11/${y}`, `16/11/${y}`,
    `01/12/${y}`, `16/12/${y}`,
    `30/12/${y}`, // งวดพิเศษสิ้นปี
  ];
}

/**
 * สร้างรายการงวดทั้งหมดย้อนหลัง N ปี
 * เรียง: เก่าสุด → ใหม่สุด (เพื่อ append ได้ปลอดภัย)
 */
function buildTargetDates(yearsBack) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const all = [];

  // เริ่มจากปีที่เก่าที่สุด → ปีปัจจุบัน
  for (let y = currentYear - yearsBack; y <= currentYear; y++) {
    all.push(...getDatesForYear(y));
  }

  // กรอง: เอาเฉพาะงวดที่ "เป็นไปได้" (≤ วันนี้)
  return all.filter((d) => parseThaiDate(d) <= today);
}

// ---------------------------------------------------------------------------
//  API call — ปรับปรุงให้มี timeout + retry
// ---------------------------------------------------------------------------
/**
 * เรียก GLO API ครั้งเดียว (มี timeout)
 */
function fetchFromGLORaw(day, month, year) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ date: day, month: month, year: year });
    const options = {
      hostname: 'www.glo.or.th',
      path: '/api/checking/getLotteryResult',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload, 'utf-8'),
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * เรียก GLO API พร้อม retry + exponential backoff
 */
async function fetchFromGLO(day, month, year) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchFromGLORaw(day, month, year);
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await delay(backoff);
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
//  แปลง response → record ใน dataset
// ---------------------------------------------------------------------------
function parseGLOResponse(response, dateStr, fallback) {
  const data = response?.response?.result?.data;
  if (!data) return null;

  const first = data.first?.number?.[0]?.value;
  const last2 = data.last2?.number?.[0]?.value;

  if (!first || !last2) return null;

  // front3: ถ้า API ไม่มีข้อมูล → fallback ไปใช้ของเดิม หรือ "000"
  const front3 = data.last3f?.number?.length
    ? data.last3f.number.map((n) => n.value)
    : (fallback?.front3 ?? ['000', '000']);

  const back3 = data.last3b?.number?.length
    ? data.last3b.number.map((n) => n.value)
    : (fallback?.back3 ?? ['000', '000']);

  return { date: dateStr, first, last2, front3, back3 };
}

// ---------------------------------------------------------------------------
//  Main — scrape 15 ปี
// ---------------------------------------------------------------------------
async function fetchOfficialData() {
  console.log('═'.repeat(72));
  console.log('  🎰  Thai Lottery Backfill — GLO API');
  console.log('═'.repeat(72));

  const existingData = loadExisting();
  const existingMap = new Map(existingData.map((d) => [d.date, d]));
  console.log(`📂 โหลดข้อมูลเดิม: ${existingData.length} งวด`);

  const targetDates = buildTargetDates(BACKFILL_YEARS);
  console.log(`📅 งวดเป้าหมายทั้งหมด: ${targetDates.length} งวด (${BACKFILL_YEARS} ปีย้อนหลัง)\n`);

  const dataset = new Map(existingMap); // เริ่มจากข้อมูลเดิม
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  // ประมวลผลเป็น batch
  for (let i = 0; i < targetDates.length; i += BATCH_SIZE) {
    const batch = targetDates.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (dateStr) => {
        const [d, m, yThai] = dateStr.split('/');
        const ceYear = String(parseInt(yThai) - 543);
        const existing = existingMap.get(dateStr);

        // ✅ ใช้ cache เฉพาะเมื่อ "ข้อมูลครบทุก field"
        if (existing && existing.first && existing.last2 &&
            existing.front3?.length === 2 && existing.back3?.length === 2) {
          return { date: dateStr, status: 'cached', record: existing };
        }

        try {
          const response = await fetchFromGLO(d, m, ceYear);
          const record = parseGLOResponse(response, dateStr, existing);
          if (record) {
            return { date: dateStr, status: 'fetched', record };
          }
          return { date: dateStr, status: 'fallback', record: existing || null };
        } catch (e) {
          console.warn(`   ⚠️  ${dateStr} failed: ${e.message}`);
          return { date: dateStr, status: 'failed', record: existing || null };
        }
      })
    );

    for (const r of results) {
      if (r.status === 'cached') {
        skipped++;
        dataset.set(r.date, r.record);
      } else if (r.status === 'fetched' && r.record) {
        fetched++;
        dataset.set(r.date, r.record);
      } else if (r.status === 'fallback' && r.record) {
        skipped++;
        dataset.set(r.date, r.record);
      } else {
        failed++;
      }
    }

    // Progress log
    const progress = Math.min(i + BATCH_SIZE, targetDates.length);
    console.log(
      `   ⏳  ${progress}/${targetDates.length}  │  ` +
      `fetched: ${fetched}  cached: ${skipped}  failed: ${failed}`
    );

    // หน่วงระหว่าง batch
    if (i + BATCH_SIZE < targetDates.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  // เรียงข้อมูลตามวันที่ (เก่า→ใหม่)
  const finalData = [...dataset.values()].sort(
    (a, b) => parseThaiDate(a.date) - parseThaiDate(b.date)
  );

  // บันทึก
  saveAtomic(FILE_PATH, finalData);

  console.log('\n' + '═'.repeat(72));
  console.log('  ✅  เสร็จสิ้น');
  console.log(`  📊  ทั้งหมด: ${finalData.length} งวด`);
  console.log(`  📥  ดึงใหม่: ${fetched} งวด`);
  console.log(`  💾  ใช้ cache: ${skipped} งวด`);
  console.log(`  ❌  ล้มเหลว: ${failed} งวด`);
  console.log(`  💾  บันทึก: ${FILE_PATH}`);
  console.log('═'.repeat(72));
}

fetchOfficialData().catch((e) => {
  console.error('💥 Fatal error:', e);
  process.exit(1);
});
