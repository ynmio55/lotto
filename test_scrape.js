const https = require('https');

https.get('https://myhora.com/lottery/stats.aspx?mx=09&vx=15', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // The data is likely in some div. Let's find patterns like 16 กันยายน 2567
    const lines = data.split('\n');
    let output = '';
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('กันยายน')) {
            output += lines.slice(i-2, i+15).join('\n') + '\n---------------\n';
        }
    }
    console.log(output.substring(0, 3000));
  });
});
