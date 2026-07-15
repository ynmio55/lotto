import { useState, useEffect, useMemo } from 'react';
import dataset from './data/dataset.json';
import { analyzeData, generatePrediction, generateMostProbable, generateColdNumbers } from './analyzer';
import './index.css';

const MONTHS = [
  { value: 'all', label: 'ทุกเดือน' },
  { value: '01', label: 'มกราคม' },
  { value: '02', label: 'กุมภาพันธ์' },
  { value: '03', label: 'มีนาคม' },
  { value: '04', label: 'เมษายน' },
  { value: '05', label: 'พฤษภาคม' },
  { value: '06', label: 'มิถุนายน' },
  { value: '07', label: 'กรกฎาคม' },
  { value: '08', label: 'สิงหาคม' },
  { value: '09', label: 'กันยายน' },
  { value: '10', label: 'ตุลาคม' },
  { value: '11', label: 'พฤศจิกายน' },
  { value: '12', label: 'ธันวาคม' },
];

const DRAWS = [
  { value: 'all', label: 'ทุกงวด' },
  { value: 'beginning', label: 'ต้นเดือน (1, 2)' },
  { value: 'middle', label: 'กลางเดือน (16, 17)' },
  { value: 'end', label: 'ปลายเดือน (30, 31)' },
];

const DAYS_OF_WEEK = [
  { value: 'all', label: 'ทุกวัน' },
  { value: '0', label: 'อาทิตย์' },
  { value: '1', label: 'จันทร์' },
  { value: '2', label: 'อังคาร' },
  { value: '3', label: 'พุธ' },
  { value: '4', label: 'พฤหัสบดี' },
  { value: '5', label: 'ศุกร์' },
  { value: '6', label: 'เสาร์' },
];

const getDayOfWeek = (dateStr) => {
  const [d, m, yThai] = dateStr.split('/');
  const yEng = parseInt(yThai) - 543;
  const date = new Date(yEng, parseInt(m) - 1, parseInt(d));
  return date.getDay().toString();
};

const getBadgeLabel = (score, isCold) => {
  if (isCold) {
    if (score >= 90) return { text: 'ดับสนิท', level: 'danger' };
    if (score >= 80) return { text: 'ไม่ออกนานแล้ว', level: 'warning' };
    return { text: 'ความถี่ต่ำ', level: 'neutral' };
  }
  if (score >= 90) return { text: 'ออกบ่อยมากที่สุด', level: 'success' };
  if (score >= 80) return { text: 'ออกบ่อย', level: 'info' };
  return { text: 'พอสมควร', level: 'neutral' };
};

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="select-field">
      <label className="select-label">{label}</label>
      <select className="select-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function NumberCard({ title, dataObj, isCold, isLarge }) {
  const badge = getBadgeLabel(dataObj.confidence, isCold);
  return (
    <div className={`number-card ${isCold ? 'number-card--cold' : 'number-card--hot'}`}>
      <span className="number-card__label">{title}</span>
      <span className={`number-card__num ${isLarge ? 'number-card__num--lg' : ''}`}>{dataObj.number}</span>
      <span className={`badge badge--${badge.level}`}>{badge.text}</span>
    </div>
  );
}

function NumberCardMulti({ title, dataArray, isCold }) {
  const badge = getBadgeLabel(dataArray[0]?.confidence, isCold);
  return (
    <div className={`number-card ${isCold ? 'number-card--cold' : 'number-card--hot'}`}>
      <span className="number-card__label">{title}</span>
      <div className="number-card__multi">
        {dataArray.map((d, i) => (
          <div key={i} className="number-card__multi-item">
            <span className="number-card__num">{d.number}</span>
          </div>
        ))}
      </div>
      <span className={`badge badge--${badge.level}`}>{badge.text}</span>
    </div>
  );
}

function StatBar({ label, count, max, accent }) {
  const pct = Math.min(100, Math.round((count / max) * 100));
  return (
    <div className="stat-bar-row">
      <span className="stat-bar-label">{label}</span>
      <div className="stat-bar-track">
        <div className={`stat-bar-fill ${accent ? 'stat-bar-fill--accent' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="stat-bar-count">{count}</span>
    </div>
  );
}

function App() {
  const [stats, setStats] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedDraw, setSelectedDraw] = useState('all');
  const [selectedDay, setSelectedDay] = useState('all');

  const filteredDataset = useMemo(() => {
    return dataset.filter((draw) => {
      const [day, month] = draw.date.split('/');
      const monthMatch = selectedMonth === 'all' || month === selectedMonth;
      let drawMatch = true;
      if (selectedDraw === 'beginning') drawMatch = day === '01' || day === '02';
      else if (selectedDraw === 'middle') drawMatch = day === '16' || day === '17';
      else if (selectedDraw === 'end') drawMatch = ['28', '29', '30', '31'].includes(day);
      const drawDay = getDayOfWeek(draw.date);
      const dayMatch = selectedDay === 'all' || drawDay === selectedDay;
      return monthMatch && drawMatch && dayMatch;
    });
  }, [selectedMonth, selectedDraw, selectedDay]);

  useEffect(() => {
    const analysis = analyzeData(filteredDataset);
    setStats(analysis);
    setPredictions(null);
  }, [filteredDataset]);

  const handlePredict = () => {
    if (!stats || stats.totalRecords === 0) return;
    setIsCalculating(true);
    setPredictions(null);
    setTimeout(() => {
      setPredictions({
        topPick: generateMostProbable(stats),
        randomPick: generatePrediction(stats),
        coldPick: generateColdNumbers(stats),
      });
      setIsCalculating(false);
    }, 1600);
  };

  const maxDigitCount = stats ? stats.digitFrequencies[0]?.count || 1 : 1;
  const maxLast2Count = stats ? (stats.last2Frequencies[0]?.[1] || 1) : 1;

  return (
    <div className="page">

      {/* ── NAV ── */}
      <header className="nav">
        <div className="nav__inner container">
          <span className="nav__brand">LottoStat</span>
          <span className="nav__tagline">วิเคราะห์สลากฯ ด้วยข้อมูลสถิติ</span>
        </div>
      </header>

      <main className="container main">

        {/* ── HERO ── */}
        <section className="hero">
          <h1 className="hero__title">วิเคราะห์หวยไทย<br />ด้วยสถิติ 15 ปี</h1>
          <p className="hero__sub">เลือกเงื่อนไขที่ต้องการ แล้วให้ระบบคัดกรองตัวเลขจากฐานข้อมูลย้อนหลัง {dataset.length} งวด</p>
          <div className="hero__chips">
            <span className="chip">{dataset.length} งวด</span>
            <span className="chip">15 ปีย้อนหลัง</span>
            <span className="chip">3 วิธีวิเคราะห์</span>
          </div>
        </section>

        {/* ── FILTER ── */}
        <section className="card filter-section">
          <div className="section-label">กรองข้อมูล</div>
          <div className="filter-grid">
            <SelectField label="เดือน" value={selectedMonth} onChange={setSelectedMonth} options={MONTHS} />
            <SelectField label="งวด" value={selectedDraw} onChange={setSelectedDraw} options={DRAWS} />
            <SelectField label="เลขกำลังวัน" value={selectedDay} onChange={setSelectedDay} options={DAYS_OF_WEEK} />
          </div>
          <div className="filter-meta">
            ใช้ข้อมูล <strong>{filteredDataset.length}</strong> งวด จากทั้งหมด {dataset.length} งวด
          </div>
        </section>

        {/* ── ANALYZE BUTTON ── */}
        <section className="analyze-section">
          {filteredDataset.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">—</div>
              <p className="empty-state__text">ไม่พบข้อมูลในเงื่อนไขที่เลือก กรุณาเปลี่ยนตัวกรอง</p>
            </div>
          ) : (
            <button
              className={`btn-analyze ${isCalculating ? 'btn-analyze--loading' : ''}`}
              onClick={handlePredict}
              disabled={isCalculating}
              aria-label="เริ่มวิเคราะห์สถิติ"
            >
              {isCalculating ? (
                <><span className="spin" aria-hidden="true" /> กำลังวิเคราะห์...</>
              ) : (
                'วิเคราะห์สถิติ'
              )}
            </button>
          )}
        </section>

        {/* ── RESULTS ── */}
        {predictions && !isCalculating && (
          <div className="results fade-in">

            {/* Top Pick */}
            <section className="card result-section">
              <div className="result-section__header">
                <div>
                  <div className="section-label">ชุดเต็ง — Top Pick</div>
                  <p className="result-section__desc">ตัวเลขที่มีสถิติออกบ่อยที่สุดในแต่ละตำแหน่ง</p>
                </div>
                <span className="result-tag result-tag--hot">สถิติสูงสุด</span>
              </div>
              <div className="number-grid">
                <NumberCard title="รางวัลที่ 1" dataObj={predictions.topPick.firstPrize} isLarge />
                <NumberCard title="เลขท้าย 2 ตัว" dataObj={predictions.topPick.last2} />
                <NumberCardMulti title="เลขหน้า 3 ตัว" dataArray={predictions.topPick.front3} />
                <NumberCardMulti title="เลขท้าย 3 ตัว" dataArray={predictions.topPick.back3} />
              </div>
            </section>

            {/* AI Random */}
            <section className="card result-section">
              <div className="result-section__header">
                <div>
                  <div className="section-label">ชุดสุ่ม — AI Weighted Random</div>
                  <p className="result-section__desc">สุ่มโดยให้น้ำหนักกับตัวเลขที่มีความถี่สูงกว่า</p>
                </div>
                <span className="result-tag result-tag--neutral">สุ่มตามสถิติ</span>
              </div>
              <div className="number-grid number-grid--2">
                <NumberCard title="รางวัลที่ 1" dataObj={predictions.randomPick.firstPrize} isLarge />
                <NumberCard title="เลขท้าย 2 ตัว" dataObj={predictions.randomPick.last2} />
              </div>
            </section>

            {/* Cold Numbers */}
            <section className="card result-section result-section--cold">
              <div className="result-section__header">
                <div>
                  <div className="section-label">เลขดับ — Numbers to Avoid</div>
                  <p className="result-section__desc">ตัวเลขที่มีสถิติออกน้อยที่สุด ควรหลีกเลี่ยง</p>
                </div>
                <span className="result-tag result-tag--cold">ความถี่ต่ำ</span>
              </div>
              <div className="number-grid number-grid--2">
                <NumberCard title="รางวัลที่ 1" dataObj={predictions.coldPick.firstPrize} isCold />
                <NumberCard title="เลขท้าย 2 ตัว" dataObj={predictions.coldPick.last2} isCold />
              </div>
            </section>

            <p className="disclaimer">
              หมายเหตุ: ตัวเลขข้างต้นคำนวณจากสถิติความถี่ในอดีตเท่านั้น ไม่ใช่การการันตีหรือโอกาสในการถูกรางวัล โปรดใช้วิจารณญาณในการตัดสินใจ
            </p>
          </div>
        )}

        {/* ── RAW STATS ── */}
        {stats && stats.totalRecords > 0 && (
          <section className="card stats-section">
            <div className="section-label">ภาพรวมสถิติ</div>
            <div className="stats-grid">
              <div>
                <h3 className="stats-title">ตัวเลขที่ออกบ่อยที่สุด</h3>
                <div className="stat-bar-list">
                  {stats.digitFrequencies.slice(0, 8).map((item) => (
                    <StatBar key={item.digit} label={`เลข ${item.digit}`} count={item.count} max={maxDigitCount} />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="stats-title">เลขท้าย 2 ตัวออกบ่อย</h3>
                <div className="stat-bar-list">
                  {stats.last2Frequencies.slice(0, 8).map(([num, count]) => (
                    <StatBar key={num} label={num} count={count} max={maxLast2Count} accent />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── HISTORY TABLE ── */}
        {stats && filteredDataset.length > 0 && (
          <section className="card">
            <div className="section-label">ผลสลากย้อนหลัง</div>
            <p className="table-meta">แสดง {Math.min(50, filteredDataset.length)} งวดล่าสุด จากทั้งหมด {filteredDataset.length} งวด</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>รางวัลที่ 1</th>
                    <th>ท้าย 2 ตัว</th>
                    <th>หน้า 3 ตัว</th>
                    <th>ท้าย 3 ตัว</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDataset.slice(0, 50).map((draw, i) => (
                    <tr key={i}>
                      <td className="td-date">{draw.date}</td>
                      <td className="td-first">{draw.first}</td>
                      <td>{draw.last2}</td>
                      <td className="td-small">{draw.front3.join(', ')}</td>
                      <td className="td-small">{draw.back3.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </main>

      <footer className="footer">
        <div className="container">
          <span>LottoStat — วิเคราะห์เพื่อประกอบการตัดสินใจ ไม่ใช่การการันตีผล</span>
        </div>
      </footer>

    </div>
  );
}

export default App;
