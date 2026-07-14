import assert from 'node:assert/strict';
import {
  calculatePercentageChange,
  deriveCpiTrend,
  deriveRateChange,
  deriveStablecoinChanges,
  deriveYahooChange5d,
  selectNearestPriorPoint,
} from '../src/macro.js';

const dayMs = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 13);

{
  const selected = selectNearestPriorPoint([
    { timestamp: now - 9 * dayMs, value: 90 },
    { timestamp: now - 7 * dayMs, value: 100 },
    { timestamp: now - 6 * dayMs, value: 110 },
  ], now - 7 * dayMs);
  assert.equal(selected.value, 100);
  assert.equal(calculatePercentageChange(110, 100), 10);
}

{
  const changes = deriveStablecoinChanges([
    { date: Math.floor((now - 31 * dayMs) / 1000), totalCirculating: { peggedUSD: 80 } },
    { date: Math.floor((now - 30 * dayMs) / 1000), totalCirculating: { peggedUSD: 80 } },
    { date: Math.floor((now - 7 * dayMs) / 1000), totalCirculating: { peggedUSD: 100 } },
    { date: Math.floor(now / 1000), totalCirculating: { peggedUSD: 130 } },
  ]);
  assert.equal(changes.change7dPct, 30);
  assert.equal(changes.change30dPct, 62.5);
}

{
  const rate = deriveRateChange([
    { percentRate: '3.50', effectiveDt: '2026-07-10' },
    { percentRate: '3.75', effectiveDt: '2026-07-09' },
  ]);
  assert.equal(rate.change, -0.25);
  assert.equal(rate.direction, 'falling');
  assert.equal(rate.previousRate, 3.75);
}

{
  const cpi = deriveCpiTrend([
    { year: '2026', period: 'M04', periodName: 'April', value: '320' },
    { year: '2026', period: 'M03', periodName: 'March', value: '315' },
    { year: '2025', period: 'M04', periodName: 'April', value: '310' },
    { year: '2025', period: 'M03', periodName: 'March', value: '308' },
  ]);
  assert.equal(Number(cpi.yoyPct.toFixed(6)), 3.225806);
  assert.equal(Number(cpi.previousYoyPct.toFixed(6)), 2.272727);
  assert.equal(cpi.direction, 'rising');
}

{
  assert.equal(deriveYahooChange5d([90, 92, 94, 96, 98, 100], 100), 11.111111111111);
  assert.equal(deriveYahooChange5d([100], 100), null);
  assert.deepEqual(deriveStablecoinChanges([]), {
    latestValue: null,
    latestTimestamp: null,
    change7dPct: null,
    change30dPct: null,
  });
  assert.deepEqual(deriveRateChange([]), {
    previousRate: null,
    change: null,
    direction: null,
  });
  assert.equal(deriveCpiTrend([]).direction, null);
}

console.log('macro signal tests passed');
