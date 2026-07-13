function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function utcDay(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function dailySeries(points = [], valueIndex = 1) {
  const byDay = new Map();
  for (const point of points) {
    const timestamp = Array.isArray(point) ? finiteNumber(point[0]) : finiteNumber(point?.timestamp);
    const value = Array.isArray(point) ? finiteNumber(point[valueIndex]) : finiteNumber(point?.value);
    const day = utcDay(timestamp);
    if (day === null || value === null) continue;
    const previous = byDay.get(day);
    if (!previous || timestamp >= previous.timestamp) byDay.set(day, { timestamp, value });
  }
  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function percentChange(current, previous) {
  const currentValue = finiteNumber(current);
  const previousValue = finiteNumber(previous);
  if (currentValue === null || previousValue === null || previousValue === 0) return null;
  return Number((((currentValue / previousValue) - 1) * 100).toFixed(12));
}

export function sampleStandardDeviation(values = []) {
  const numbers = values.map(finiteNumber).filter(value => value !== null);
  if (numbers.length < 2) return null;
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance = numbers.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (numbers.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function normalizeOhlcBars(ohlc = []) {
  return ohlc
    .map(bar => ({
      timestamp: finiteNumber(Array.isArray(bar) ? bar[0] : bar?.timestamp),
      open: finiteNumber(Array.isArray(bar) ? bar[1] : bar?.open),
      high: finiteNumber(Array.isArray(bar) ? bar[2] : bar?.high),
      low: finiteNumber(Array.isArray(bar) ? bar[3] : bar?.low),
      close: finiteNumber(Array.isArray(bar) ? bar[4] : bar?.close),
    }))
    .filter(bar => bar.timestamp !== null && bar.high !== null && bar.low !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function dailyOhlc(ohlc = []) {
  const byDay = new Map();
  for (const bar of normalizeOhlcBars(ohlc)) {
    const day = utcDay(bar.timestamp);
    if (day === null) continue;
    const aggregate = byDay.get(day);
    if (!aggregate) {
      byDay.set(day, { ...bar, day, firstTimestamp: bar.timestamp, lastTimestamp: bar.timestamp });
      continue;
    }
    aggregate.high = Math.max(aggregate.high, bar.high);
    aggregate.low = Math.min(aggregate.low, bar.low);
    if (bar.timestamp < aggregate.firstTimestamp) {
      aggregate.firstTimestamp = bar.timestamp;
      aggregate.open = bar.open;
    }
    if (bar.timestamp >= aggregate.lastTimestamp) {
      aggregate.lastTimestamp = bar.timestamp;
      aggregate.timestamp = bar.timestamp;
      aggregate.close = bar.close;
    }
  }
  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function findSwingCandidates(ohlc = []) {
  const bars = normalizeOhlcBars(ohlc);
  const candidates = [];
  for (let index = 2; index < bars.length - 2; index += 1) {
    const bar = bars[index];
    const neighbors = [bars[index - 2], bars[index - 1], bars[index + 1], bars[index + 2]];
    if (neighbors.every(neighbor => bar.low < neighbor.low)) {
      candidates.push({ type: 'support', value: bar.low, timestamp: bar.timestamp, index });
    }
    if (neighbors.every(neighbor => bar.high > neighbor.high)) {
      candidates.push({ type: 'resistance', value: bar.high, timestamp: bar.timestamp, index });
    }
  }
  return candidates;
}

export function clusterLevels(candidates = [], current, tolerance = 0.015) {
  const currentValue = finiteNumber(current);
  const sorted = candidates
    .map(candidate => ({ ...candidate, value: finiteNumber(candidate?.value), timestamp: finiteNumber(candidate?.timestamp) ?? 0 }))
    .filter(candidate => candidate.value !== null && candidate.value > 0)
    .sort((a, b) => a.value - b.value || a.timestamp - b.timestamp);
  const clusters = [];

  for (const candidate of sorted) {
    let cluster = clusters.find(entry => Math.abs(candidate.value - entry.level) / entry.level <= tolerance);
    if (!cluster) {
      cluster = { values: [], timestamps: [], level: candidate.value };
      clusters.push(cluster);
    }
    cluster.values.push(candidate.value);
    cluster.timestamps.push(candidate.timestamp);
    cluster.level = cluster.values.reduce((sum, value) => sum + value, 0) / cluster.values.length;
  }

  return clusters
    .map(cluster => ({
      level: cluster.level,
      touches: cluster.values.length,
      recency: Math.max(...cluster.timestamps),
      proximity: currentValue && currentValue > 0 ? Math.abs(cluster.level - currentValue) / currentValue : null,
    }))
    .sort((a, b) => b.touches - a.touches || b.recency - a.recency || (a.proximity ?? Infinity) - (b.proximity ?? Infinity));
}

function priceRange(bars) {
  if (!bars.length) return null;
  const lows = bars.map(bar => bar.low).filter(value => Number.isFinite(value));
  const highs = bars.map(bar => bar.high).filter(value => Number.isFinite(value));
  if (!lows.length || !highs.length) return null;
  return { low: Math.min(...lows), high: Math.max(...highs) };
}

function validLevel(level, current, side) {
  return Number.isFinite(level) && (side === 'support' ? level < current : level > current);
}

export function deriveMarketSignals({ current, ohlc = [], marketChart = {} } = {}) {
  const currentValue = finiteNumber(typeof current === 'object' ? current?.current_price : current);
  const bars = dailyOhlc(ohlc);
  const prices = dailySeries(marketChart?.prices || []);
  const volumes = dailySeries(marketChart?.total_volumes || []);

  const range7d = bars.length >= 7 ? priceRange(bars.slice(-7)) : null;
  const range30d = bars.length >= 21 ? priceRange(bars.slice(-30)) : null;
  const rangePosition30d = currentValue !== null && range30d && range30d.high > range30d.low
    ? (currentValue - range30d.low) / (range30d.high - range30d.low)
    : null;

  const latest7dPct = currentValue !== null && prices.length >= 8
    ? percentChange(currentValue, prices.at(-8).value)
    : null;
  const prior7dPct = prices.length >= 15
    ? percentChange(prices.at(-8).value, prices.at(-15).value)
    : null;
  const momentum7dPctPoints = latest7dPct !== null && prior7dPct !== null
    ? latest7dPct - prior7dPct
    : null;

  let volumeTrend = null;
  if (volumes.length >= 8) {
    const previous = volumes.slice(-8, -1).map(point => point.value);
    const previousMean = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    if (previousMean > 0) volumeTrend = (volumes.at(-1).value / previousMean) - 1;
  }

  const logReturns = [];
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1].value;
    const next = prices[index].value;
    if (previous > 0 && next > 0) logReturns.push(Math.log(next / previous));
  }
  const dailyVolatility = sampleStandardDeviation(logReturns);
  const realizedVolatilityAnnualized = dailyVolatility === null ? null : dailyVolatility * Math.sqrt(365);

  const swingCandidates = findSwingCandidates(bars);
  const supportCluster = currentValue === null ? null : clusterLevels(
    swingCandidates.filter(candidate => candidate.type === 'support' && candidate.value < currentValue),
    currentValue
  )[0];
  const resistanceCluster = currentValue === null ? null : clusterLevels(
    swingCandidates.filter(candidate => candidate.type === 'resistance' && candidate.value > currentValue),
    currentValue
  )[0];

  let support = supportCluster?.level ?? null;
  let supportMethod = support === null ? null : 'swing-cluster';
  if (currentValue !== null && !validLevel(support, currentValue, 'support')) {
    support = validLevel(range7d?.low, currentValue, 'support') ? range7d.low
      : validLevel(range30d?.low, currentValue, 'support') ? range30d.low
        : null;
    supportMethod = support === null ? null : (support === range7d?.low ? 'range-7d' : 'range-30d');
  }

  let resistance = resistanceCluster?.level ?? null;
  let resistanceMethod = resistance === null ? null : 'swing-cluster';
  if (currentValue !== null && !validLevel(resistance, currentValue, 'resistance')) {
    resistance = validLevel(range7d?.high, currentValue, 'resistance') ? range7d.high
      : validLevel(range30d?.high, currentValue, 'resistance') ? range30d.high
        : null;
    resistanceMethod = resistance === null ? null : (resistance === range7d?.high ? 'range-7d' : 'range-30d');
  }

  const result = {
    current: currentValue,
    change7dPct: latest7dPct,
    range7d,
    range30d,
    rangePosition30d,
    latest7dPct,
    prior7dPct,
    momentum7dPctPoints,
    volumeTrend,
    realizedVolatilityAnnualized,
    support,
    supportMethod,
    resistance,
    resistanceMethod,
  };
  const unavailableFields = Object.entries(result)
    .filter(([key, value]) => value === null && !key.endsWith('Method'))
    .map(([key]) => key);

  return { ...result, unavailableFields };
}
