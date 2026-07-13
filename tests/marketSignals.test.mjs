import assert from 'node:assert/strict';
import {
  clusterLevels,
  dailySeries,
  deriveMarketSignals,
  findSwingCandidates,
  percentChange,
  sampleStandardDeviation,
} from '../src/market.js';

const dayMs = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 5, 1);
const closes = Array.from({ length: 30 }, (_, index) => index < 15 ? 80 : index < 23 ? 90 : 100);
const ohlc = closes.map((close, index) => [
  start + index * dayMs,
  close,
  index === 4 ? 120 : close + 2,
  index === 3 || close === 80 ? 80 : close - 2,
  close,
]);
const prices = closes.map((close, index) => [start + index * dayMs, close]);
const totalVolumes = closes.map((_, index) => [start + index * dayMs, index === 29 ? 200 : 100]);

{
  const series = dailySeries([
    [start, 10],
    [start + 60_000, 11],
    [start + dayMs, 12],
    [start + 2 * dayMs, null],
  ]);
  assert.deepEqual(series.map(point => point.value), [11, 12]);
  assert.equal(percentChange(110, 100), 10);
  assert.equal(sampleStandardDeviation([1, 1, 1]), 0);
}

{
  const candidates = findSwingCandidates([
    [start, 10, 11, 9, 10],
    [start + dayMs, 10, 12, 8, 10],
    [start + 2 * dayMs, 10, 15, 5, 10],
    [start + 3 * dayMs, 10, 12, 8, 10],
    [start + 4 * dayMs, 10, 11, 9, 10],
  ]);
  assert.equal(candidates.some(candidate => candidate.type === 'support' && candidate.value === 5), true);
  assert.equal(candidates.some(candidate => candidate.type === 'resistance' && candidate.value === 15), true);

  const clusters = clusterLevels([
    { value: 98, timestamp: start },
    { value: 99, timestamp: start + dayMs },
    { value: 110, timestamp: start + 2 * dayMs },
  ], 100);
  assert.equal(clusters[0].touches, 2);
}

{
  const signals = deriveMarketSignals({
    current: 100,
    ohlc,
    marketChart: { prices, total_volumes: totalVolumes },
  });

  assert.deepEqual(signals.range30d, { low: 80, high: 120 });
  assert.equal(signals.rangePosition30d, 0.5);
  assert.equal(Number(signals.momentum7dPctPoints.toFixed(6)), 11.111111);
  assert.equal(signals.volumeTrend, 1);
  assert.equal(signals.realizedVolatilityAnnualized >= 0, true);
  assert.equal(signals.support < 100, true);
  assert.equal(signals.resistance > 100, true);
  assert.deepEqual(signals.unavailableFields, []);
}

{
  const signals = deriveMarketSignals({
    current: 100,
    ohlc: ohlc.slice(0, 3),
    marketChart: { prices: prices.slice(0, 3), total_volumes: totalVolumes.slice(0, 3) },
  });

  assert.equal(signals.range30d, null);
  assert.equal(signals.rangePosition30d, null);
  assert.equal(signals.momentum7dPctPoints, null);
  assert.equal(signals.volumeTrend, null);
  assert.equal(signals.support, null);
  assert.equal(signals.resistance, null);
  assert.equal(signals.unavailableFields.includes('range30d'), true);
}

console.log('market signal tests passed');
