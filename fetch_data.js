const fs = require('fs');
const path = require('path');
const https = require('https');

const filePath = path.join(__dirname, 'app', 'src', 'data', 'dataset.json');

let existingData = [];
try {
  existingData = require(filePath);
} catch (e) {
  existingData = [];
}

const fetchFromGLO = (day, month, year) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ date: day, month: month, year: year });
    const options = {
      hostname: 'www.glo.or.th',
      path: '/api/checking/getLotteryResult',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

const delay = ms => new Promise(res => setTimeout(res, ms));

// Generate standard dates for a given year
function getDatesForYear(year) {
  const dates = [];
  const pad = n => n.toString().padStart(2, '0');
  const thaiYear = year + 543;
  
  // Standard schedule exceptions
  dates.push(`17/01/${thaiYear}`);
  dates.push(`01/02/${thaiYear}`, `16/02/${thaiYear}`);
  dates.push(`01/03/${thaiYear}`, `16/03/${thaiYear}`);
  dates.push(`01/04/${thaiYear}`, `16/04/${thaiYear}`);
  dates.push(`02/05/${thaiYear}`, `16/05/${thaiYear}`);
  dates.push(`01/06/${thaiYear}`, `16/06/${thaiYear}`);
  dates.push(`01/07/${thaiYear}`, `16/07/${thaiYear}`);
  dates.push(`01/08/${thaiYear}`, `16/08/${thaiYear}`);
  dates.push(`01/09/${thaiYear}`, `16/09/${thaiYear}`);
  dates.push(`01/10/${thaiYear}`, `16/10/${thaiYear}`);
  dates.push(`01/11/${thaiYear}`, `16/11/${thaiYear}`);
  dates.push(`01/12/${thaiYear}`, `16/12/${thaiYear}`, `30/12/${thaiYear}`);
  
  return dates.reverse(); // newest first
}

async function fetchOfficialData() {
  console.log('Fetching official Thai lottery data from GLO API...');
  
  // Create a list of dates from 2026 (current year) down to 2011
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  let allTargetDates = [];
  
  for (let y = currentYear; y >= currentYear - 15; y--) {
    allTargetDates.push(...getDatesForYear(y));
  }
  
  // Filter out future dates
  allTargetDates = allTargetDates.filter(d => {
    const parts = d.split('/');
    const dDate = new Date(parseInt(parts[2]) - 543, parseInt(parts[1]) - 1, parseInt(parts[0]));
    return dDate <= currentDate;
  });
  
  // Create a map of existing data for quick lookup
  const existingMap = new Map();
  existingData.forEach(d => existingMap.set(d.date, d));

  const officialDataset = [];
  const batchSize = 5;
  
  for (let i = 0; i < allTargetDates.length; i += batchSize) {
    const batch = allTargetDates.slice(i, i + batchSize);
    
    const promises = batch.map(async (dateStr) => {
      const parts = dateStr.split('/');
      const day = parts[0];
      const month = parts[1];
      const thaiYear = parts[2];
      const year = (parseInt(thaiYear) - 543).toString();
      
      const existing = existingMap.get(dateStr);
      
      // If we already have full data from a previous run, we can use it to speed up (unless we want to force refresh)
      // We will try GLO API first for the most recent 50 draws to ensure they are up to date.
      if (existing && i > 50) {
          return existing;
      }
      
      try {
        const response = await fetchFromGLO(day, month, year);
        if (response?.response?.result?.data) {
          const data = response.response.result.data;
          const first = data.first?.number[0]?.value;
          const last2 = data.last2?.number[0]?.value;
          
          let front3 = ["000", "000"];
          if (data.last3f?.number) {
            front3 = data.last3f.number.map(n => n.value);
            // sometimes it's undefined or empty, fallback gracefully
          } else if (existing?.front3) {
            front3 = existing.front3;
          }
          
          let back3 = ["000", "000"];
          if (data.last3b?.number) {
            back3 = data.last3b.number.map(n => n.value);
          } else if (existing?.back3) {
            back3 = existing.back3;
          }
          
          return { date: dateStr, first, last2, front3, back3 };
        } else {
          return existing || null;
        }
      } catch (err) {
        return existing || null;
      }
    });
    
    const results = await Promise.all(promises);
    const validResults = results.filter(r => r !== null);
    officialDataset.push(...validResults);
    
    // Only delay if we actually made network requests (i <= 50 or missing data)
    if (i <= 50) {
        console.log(`Fetched ${officialDataset.length} records...`);
        await delay(500);
    }
  }
  
  // Ensure exactly 360 records (15 years)
  const finalDataset = officialDataset.slice(0, 360);
  
  fs.writeFileSync(filePath, JSON.stringify(finalDataset, null, 2), 'utf-8');
  console.log(`Successfully generated ${finalDataset.length} records up to ${currentYear + 543} and saved to dataset.json`);
}

fetchOfficialData();
