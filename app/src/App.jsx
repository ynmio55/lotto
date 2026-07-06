import { useState, useEffect, useMemo } from 'react';
import dataset from './data/dataset.json';
import { analyzeData, generatePrediction, generateMostProbable } from './analyzer';
import './index.css';

const MONTHS = [
  { value: 'all', label: 'ทุกเดือน (ทั้งหมด)' },
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
  { value: '12', label: 'ธันวาคม' }
];

function App() {
  const [stats, setStats] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predictionType, setPredictionType] = useState(''); // 'random' or 'probable'
  const [selectedMonth, setSelectedMonth] = useState('all');

  // Filter dataset based on selected month (up to 15 years of data)
  const filteredDataset = useMemo(() => {
    if (selectedMonth === 'all') return dataset;
    return dataset.filter(draw => {
      const [, month] = draw.date.split('/');
      return month === selectedMonth;
    });
  }, [selectedMonth]);

  useEffect(() => {
    const analysis = analyzeData(filteredDataset);
    setStats(analysis);
    setPrediction(null); // Reset prediction when filter changes
  }, [filteredDataset]);

  const handlePredictRandom = () => {
    if (stats) {
      setPrediction(generatePrediction(stats));
      setPredictionType('random');
    }
  };

  const handlePredictMostProbable = () => {
    if (stats) {
      setPrediction(generateMostProbable(stats));
      setPredictionType('probable');
    }
  };

  return (
    <div className="app-container">
      <h1>ระบบวิเคราะห์หวยไทย BY MIO1</h1>

      <div className="filter-container glass-panel" style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>
          <span style={{ marginRight: '8px' }}>📅</span>
          เลือกเดือนเพื่อวิเคราะห์สถิติ (ย้อนหลัง 15 ปี)
        </h3>
        <select
          className="month-select"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{
            padding: '10px 20px',
            fontSize: '1rem',
            borderRadius: '8px',
            border: '1px solid var(--primary-color)',
            backgroundColor: 'rgba(0,0,0,0.5)',
            color: 'white',
            cursor: 'pointer',
            outline: 'none',
            minWidth: '200px'
          }}
        >
          {MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          ข้อมูลที่ใช้ประมวลผล: {filteredDataset.length} งวด
        </p>
      </div>

      {stats && (
        <div className="dashboard-grid">
          <div className="glass-panel">
            <h2>เลขมาแรง 🔥</h2>
            {stats.digitFrequencies.slice(0, 10).map((item, index) => (
              <div key={index} className="stat-item">
                <span className="stat-digit">{item.digit}</span>
                <span className="stat-count">พบ {item.count} ครั้ง</span>
              </div>
            ))}
          </div>

          <div className="glass-panel">
            <h2>เลขท้าย 2 ตัวออกบ่อย 🎯</h2>
            {stats.last2Frequencies.slice(0, 10).map((item, index) => (
              <div key={index} className="stat-item">
                <span className="stat-digit">{item[0]}</span>
                <span className="stat-count">{item[1]} งวด</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ textAlign: 'center', marginTop: '2rem' }}>
        <h2>สุ่มเลขนำโชค / คัดเลขเด็ด 🔮</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          ค้นหาเลขเด็ดจากสถิติความถี่ {selectedMonth !== 'all' ? `(เฉพาะเดือน${MONTHS.find(m => m.value === selectedMonth)?.label})` : ''}
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            className="btn"
            style={{ backgroundColor: 'var(--primary-color)' }}
            onClick={handlePredictMostProbable}
          >
            ⭐ คัดเน้นๆ (สถิติสูงสุด)
          </button>
          <button
            className="btn"
            style={{ backgroundColor: '#6c5ce7' }}
            onClick={handlePredictRandom}
          >
            🎲 สุ่มตามความน่าจะเป็น
          </button>
        </div>

        {prediction && (
          <div className="prediction-results">
            {predictionType === 'probable' && (
              <div style={{ marginBottom: '1rem', color: '#ffb8b8', fontSize: '0.9rem' }}>
                * นี่คือชุดตัวเลขที่เกิดจากการประกอบกันของ "ตัวเลขที่ออกบ่อยที่สุดในแต่ละหลัก" ตลอด 15 ปี
              </div>
            )}
            {predictionType === 'random' && (
              <div style={{ marginBottom: '1rem', color: '#81ecec', fontSize: '0.9rem' }}>
                * นี่คือชุดตัวเลขที่สุ่มขึ้นมา โดยอิงน้ำหนักจากความน่าจะเป็น (เลขที่ออกบ่อยมีโอกาสสุ่มโดนมากกว่า)
              </div>
            )}
            <div className="prediction-prize">
              <h3>รางวัลที่ 1 (6 ตัว)</h3>
              <div className="prediction-number">{prediction.firstPrize}</div>
            </div>
            <div className="dashboard-grid" style={{ marginTop: '1rem', gap: '1rem' }}>
              <div className="prediction-prize">
                <h3>เลขท้าย 2 ตัว</h3>
                <div className="prediction-number" style={{ fontSize: '2rem' }}>{prediction.last2}</div>
              </div>
              <div className="prediction-prize">
                <h3>เลขหน้า 3 ตัว</h3>
                <div className="prediction-number" style={{ fontSize: '1.5rem', letterSpacing: '2px' }}>
                  {prediction.front3.join(' - ')}
                </div>
              </div>
              <div className="prediction-prize">
                <h3>เลขท้าย 3 ตัว</h3>
                <div className="prediction-number" style={{ fontSize: '1.5rem', letterSpacing: '2px' }}>
                  {prediction.back3.join(' - ')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem' }}>
        <h2>สถิติผลสลากย้อนหลัง 📚</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="history-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>รางวัลที่ 1</th>
                <th>เลขท้าย 2 ตัว</th>
                <th>เลขหน้า 3 ตัว</th>
                <th>เลขท้าย 3 ตัว</th>
              </tr>
            </thead>
            <tbody>
              {filteredDataset.slice(0, 50).map((draw, index) => (
                <tr key={index}>
                  <td>{draw.date}</td>
                  <td style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>{draw.first}</td>
                  <td>{draw.last2}</td>
                  <td>{draw.front3.join(', ')}</td>
                  <td>{draw.back3.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.875rem' }}>
            แสดงผลสูงสุด 50 งวดล่าสุด จากทั้งหมด {filteredDataset.length} งวด
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
