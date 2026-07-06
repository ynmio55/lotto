export const analyzeData = (dataset) => {
  // Global frequencies for dashboard
  const digitFrequencies = Array(10).fill(0);
  const last2Frequencies = {};

  // Positional frequencies for precise prediction
  const createPositionalArray = (length) => Array.from({ length }, () => Array(10).fill(0));
  
  const positionalStats = {
    first: createPositionalArray(6),
    last2: createPositionalArray(2),
    front3: createPositionalArray(3),
    back3: createPositionalArray(3)
  };

  dataset.forEach(entry => {
    // 1st Prize
    if (entry.first) {
      for (let i = 0; i < entry.first.length; i++) {
        const digit = parseInt(entry.first[i]);
        if (!isNaN(digit) && i < 6) {
          digitFrequencies[digit]++;
          positionalStats.first[i][digit]++;
        }
      }
    }
    
    // Last 2
    if (entry.last2) {
      last2Frequencies[entry.last2] = (last2Frequencies[entry.last2] || 0) + 1;
      for (let i = 0; i < entry.last2.length; i++) {
        const digit = parseInt(entry.last2[i]);
        if (!isNaN(digit) && i < 2) {
          digitFrequencies[digit]++;
          positionalStats.last2[i][digit]++;
        }
      }
    }

    // Front 3
    if (entry.front3) {
      entry.front3.forEach(num => {
        if (num) {
          for (let i = 0; i < num.length; i++) {
            const digit = parseInt(num[i]);
            if (!isNaN(digit) && i < 3) {
              digitFrequencies[digit]++;
              positionalStats.front3[i][digit]++;
            }
          }
        }
      });
    }

    // Back 3
    if (entry.back3) {
      entry.back3.forEach(num => {
        if (num) {
          for (let i = 0; i < num.length; i++) {
            const digit = parseInt(num[i]);
            if (!isNaN(digit) && i < 3) {
              digitFrequencies[digit]++;
              positionalStats.back3[i][digit]++;
            }
          }
        }
      });
    }
  });

  const hotDigits = digitFrequencies
    .map((count, digit) => ({ digit, count }))
    .sort((a, b) => b.count - a.count);

  return {
    digitFrequencies: hotDigits,
    last2Frequencies: Object.entries(last2Frequencies).sort((a, b) => b[1] - a[1]),
    totalRecords: dataset.length,
    positionalStats // Exported for the predictor
  };
};

export const generatePrediction = (stats) => {
  // Advanced Weighted Random Generator based on POSITIONAL frequency
  const generateFromPositional = (positionalWeightsArray) => {
    let result = '';
    
    // For each digit position in the number
    for (let pos = 0; pos < positionalWeightsArray.length; pos++) {
      const weights = positionalWeightsArray[pos];
      const totalWeight = weights.reduce((sum, count) => sum + count, 0);
      
      let random = Math.random() * totalWeight;
      let selectedDigit = 0;
      
      for (let digit = 0; digit < 10; digit++) {
        random -= weights[digit];
        if (random <= 0) {
          selectedDigit = digit;
          break;
        }
      }
      result += selectedDigit.toString();
    }
    
    return result;
  };

  return {
    firstPrize: generateFromPositional(stats.positionalStats.first),
    last2: generateFromPositional(stats.positionalStats.last2),
    front3: [
      generateFromPositional(stats.positionalStats.front3), 
      generateFromPositional(stats.positionalStats.front3)
    ],
    back3: [
      generateFromPositional(stats.positionalStats.back3), 
      generateFromPositional(stats.positionalStats.back3)
    ],
  };
};

export const generateMostProbable = (stats) => {
  // Picks the absolute most frequent digit for each position
  const getMostProbable = (positionalWeightsArray) => {
    let result = '';
    
    for (let pos = 0; pos < positionalWeightsArray.length; pos++) {
      const weights = positionalWeightsArray[pos];
      let maxCount = -1;
      let bestDigit = 0;
      
      for (let digit = 0; digit < 10; digit++) {
        if (weights[digit] > maxCount) {
          maxCount = weights[digit];
          bestDigit = digit;
        }
      }
      result += bestDigit.toString();
    }
    
    return result;
  };

  return {
    firstPrize: getMostProbable(stats.positionalStats.first),
    last2: getMostProbable(stats.positionalStats.last2),
    front3: [
      getMostProbable(stats.positionalStats.front3),
      // If we want two different numbers for front3, we could pick the 2nd most probable for the second one.
      // For simplicity, let's just generate the top most probable, and leave the second slot empty or duplicate.
      // Wait, let's just make the second one the second most probable!
      getSecondMostProbable(stats.positionalStats.front3)
    ],
    back3: [
      getMostProbable(stats.positionalStats.back3),
      getSecondMostProbable(stats.positionalStats.back3)
    ],
  };
};

// Helper for the second most probable number
const getSecondMostProbable = (positionalWeightsArray) => {
    let result = '';
    for (let pos = 0; pos < positionalWeightsArray.length; pos++) {
      const weights = positionalWeightsArray[pos];
      let maxCount = -1;
      let secondMaxCount = -1;
      let bestDigit = 0;
      let secondBestDigit = 0;
      
      for (let digit = 0; digit < 10; digit++) {
        if (weights[digit] > maxCount) {
          secondMaxCount = maxCount;
          secondBestDigit = bestDigit;
          maxCount = weights[digit];
          bestDigit = digit;
        } else if (weights[digit] > secondMaxCount) {
          secondMaxCount = weights[digit];
          secondBestDigit = digit;
        }
      }
      result += secondBestDigit.toString();
    }
    return result;
};
