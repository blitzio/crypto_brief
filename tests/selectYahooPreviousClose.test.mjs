import assert from 'node:assert/strict';
import { resolveYahooPct, selectYahooPreviousClose } from '../worker.js';

const NY = 'America/New_York';

// Case 1: Missing timestamp on latest close.
// Should skip sameTradingDay and avoid prior-close fallback under drift.
{
  const rawCloses = [100, 101];
  const rawTimestamps = [1709251200, undefined];
  const meta = {
    regularMarketTime: 1709339000,
    exchangeTimezoneName: NY,
  };
  const price = 101.05; // <0.2% drift from lastClose
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 101, 'missing latest close timestamp should keep lastClose, not priorClose');
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

// Case 5: Same-day latest close exists, but prior close is missing in chart data.
// Should use metadata previous close instead of latest close to preserve 1D move.
{
  const rawCloses = [null, 102];
  const rawTimestamps = [1709337600, 1709424000];
  const meta = {
    regularMarketTime: 1709427600,
    regularMarketPreviousClose: 100,
    exchangeTimezoneName: NY,
  };
  const price = 102.1;
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 100, 'same-day with no prior close bar should use regularMarketPreviousClose');
}

console.log('selectYahooPreviousClose tests passed');

// Case 6: Prefer Yahoo's own regularMarketChangePercent when available.
{
  const price = 9999;
  const rawCloses = [100, 101];
  const rawTimestamps = [1709251200, 1709337600];
  const meta = {
    regularMarketChangePercent: 0.54,
    regularMarketTime: 1709427600,
    exchangeTimezoneName: NY,
  };
  const { pct, pctSource } = resolveYahooPct({ rawCloses, rawTimestamps, meta, price });
  assert.equal(pct, 0.54, 'should use regularMarketChangePercent directly');
  assert.equal(pctSource, 'regularMarketChangePercent');
}

// Case 7: Fallback to derived previous-close percent when regularMarketChangePercent is missing.
{
  const price = 103;
  const rawCloses = [100, 101, 102];
  const rawTimestamps = [1709251200, 1709337600, 1709424000];
  const meta = {
    regularMarketTime: 1709510400,
    exchangeTimezoneName: NY,
  };
  const { pct, pctSource } = resolveYahooPct({ rawCloses, rawTimestamps, meta, price });
  assert.ok(Math.abs(pct - ((103 - 102) / 102 * 100)) < 1e-9, 'should derive pct from previous-close baseline');
  assert.equal(pctSource, 'derivedPreviousClose');
}

console.log('resolveYahooPct tests passed');
