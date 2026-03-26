import assert from 'node:assert/strict';
import { selectYahooPreviousClose } from '../worker.js';

const NY = 'America/New_York';

// Case 1: Duplicate close values with missing timestamp on latest close.
// Should skip sameTradingDay and rely on drift fallback result.
{
  const rawCloses = [100, 101, 101];
  const rawTimestamps = [1709251200, 1709337600, undefined];
  const meta = {
    regularMarketTime: 1709339000,
    exchangeTimezoneName: NY,
  };
  const price = 101;
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 101, 'missing latest close timestamp should route through drift fallback result');
}

// Case 2: Latest close timestamp exists and is same trading day as market time.
// Should use prior close when available.
{
  const rawCloses = [100, 101, 102];
  const rawTimestamps = [1709251200, 1709337600, 1709424000];
  const meta = {
    regularMarketTime: 1709427600,
    exchangeTimezoneName: NY,
  };
  const price = 102.1;
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 101, 'same-day latest close should use priorClose baseline');
}

// Case 3: Latest close timestamp exists and is NOT same trading day.
// Should use latest close as previous close baseline.
{
  const rawCloses = [100, 101, 102];
  const rawTimestamps = [1709251200, 1709337600, 1709424000];
  const meta = {
    regularMarketTime: 1709510400,
    exchangeTimezoneName: NY,
  };
  const price = 103;
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 102, 'non-same-day latest close should use lastClose');
}

// Case 4: No usable closes -> metadata fallback order.
{
  const rawCloses = [null, NaN, undefined];
  const rawTimestamps = [1, 2, 3];
  const meta = {
    regularMarketPreviousClose: NaN,
    previousClose: 99,
    chartPreviousClose: 98,
    exchangeTimezoneName: NY,
  };
  const price = 100;
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 99, 'should use metadata fallback in documented order');
}

console.log('selectYahooPreviousClose tests passed');
