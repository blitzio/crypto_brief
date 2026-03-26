import assert from 'node:assert/strict';
import { resolveYahooPct, resolveYahooQuotePct, selectYahooPreviousClose } from '../worker.js';

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

// Case 5b: Latest daily bar can be stamped at 00:00 UTC and look like a different exchange day.
// Should still treat it as current session and use prior close.
{
  const rawCloses = [6556.37, 6591.9];
  const rawTimestamps = [1742860800, 1742947200]; // 2025-03-25/26 00:00:00 UTC
  const meta = {
    regularMarketTime: 1743019200, // 2025-03-26 20:00:00 UTC (market day context)
    exchangeTimezoneName: NY,
  };
  const price = 6591.9;
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 6556.37, 'UTC-stamped daily bar should still use prior close baseline');
}

// Case 5c: When prior close bar is missing and drift is tiny, metadata previous close
// should be preferred over last close to preserve non-zero 1D move.
{
  const rawCloses = [null, 6591.9];
  const rawTimestamps = [1742860800, null];
  const meta = {
    regularMarketPreviousClose: 6556.37,
    exchangeTimezoneName: NY,
  };
  const price = 6591.9001;
  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  assert.equal(prev, 6556.37, 'tiny drift with missing prior bar should use metadata previous close');
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

// Case 8: Quote endpoint percent should be preferred when present.
{
  const quote = {
    regularMarketPrice: 6591.9,
    regularMarketChangePercent: 0.54,
    regularMarketPreviousClose: 6556.37,
  };
  const out = resolveYahooQuotePct({ quote });
  assert.equal(out.price, 6591.9);
  assert.equal(out.pct, 0.54);
  assert.equal(out.pctSource, 'quoteRegularMarketChangePercent');
}

// Case 9: Quote endpoint should derive from previous close when change percent is missing.
{
  const quote = {
    regularMarketPrice: 103,
    regularMarketPreviousClose: 100,
  };
  const out = resolveYahooQuotePct({ quote });
  assert.ok(Math.abs(out.pct - 3) < 1e-12);
  assert.equal(out.pctSource, 'quoteDerivedPreviousClose');
}

console.log('resolveYahooQuotePct tests passed');
