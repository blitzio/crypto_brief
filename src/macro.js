const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedTimestamp(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function pointValue(point) {
  if (Array.isArray(point)) return finiteNumber(point[1]);
  return finiteNumber(point?.value ?? point?.totalCirculating?.peggedUSD);
}

function pointTimestamp(point) {
  if (Array.isArray(point)) return normalizedTimestamp(point[0]);
  return normalizedTimestamp(point?.timestamp ?? point?.date);
}

export function selectNearestPriorPoint(points = [], targetTimestamp) {
  const target = normalizedTimestamp(targetTimestamp);
  if (target === null) return null;
  return points
    .map(point => ({ timestamp: pointTimestamp(point), value: pointValue(point), point }))
    .filter(point => point.timestamp !== null && point.value !== null && point.timestamp <= target)
    .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

export function calculatePercentageChange(current, previous) {
  const currentValue = finiteNumber(current);
  const previousValue = finiteNumber(previous);
  if (currentValue === null || previousValue === null || previousValue === 0) return null;
  return Number((((currentValue / previousValue) - 1) * 100).toFixed(12));
}

export function deriveStablecoinChanges(points = []) {
  const normalized = points
    .map(point => ({ timestamp: pointTimestamp(point), value: pointValue(point) }))
    .filter(point => point.timestamp !== null && point.value !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
  const latest = normalized.at(-1);
  if (!latest) {
    return { latestValue: null, latestTimestamp: null, change7dPct: null, change30dPct: null };
  }

  const prior7d = selectNearestPriorPoint(normalized, latest.timestamp - 7 * DAY_MS);
  const prior30d = selectNearestPriorPoint(normalized, latest.timestamp - 30 * DAY_MS);
  return {
    latestValue: latest.value,
    latestTimestamp: latest.timestamp,
    change7dPct: calculatePercentageChange(latest.value, prior7d?.value),
    change30dPct: calculatePercentageChange(latest.value, prior30d?.value),
  };
}

function directionFromChange(change) {
  if (!Number.isFinite(change)) return null;
  return change > 0 ? 'rising' : change < 0 ? 'falling' : 'flat';
}

export function deriveRateChange(refRates = []) {
  const rates = refRates
    .map((entry, index) => ({
      rate: finiteNumber(entry?.percentRate ?? entry?.rate),
      timestamp: normalizedTimestamp(entry?.effectiveDt ?? entry?.date),
      index,
    }))
    .filter(entry => entry.rate !== null)
    .sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) return a.index - b.index;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return b.timestamp - a.timestamp;
    });
  if (rates.length < 2) return { previousRate: null, change: null, direction: null };
  const change = Number((rates[0].rate - rates[1].rate).toFixed(6));
  return { previousRate: rates[1].rate, change, direction: directionFromChange(change) };
}

function cpiPeriodNumber(record) {
  const year = Number.parseInt(record?.year, 10);
  const month = Number.parseInt(String(record?.period || '').replace(/^M/, ''), 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month, key: `${year}-M${String(month).padStart(2, '0')}`, order: year * 100 + month };
}

export function deriveCpiTrend(series = []) {
  const records = series
    .map(record => ({ ...record, periodInfo: cpiPeriodNumber(record), numericValue: finiteNumber(record?.value) }))
    .filter(record => record.periodInfo && record.numericValue !== null)
    .sort((a, b) => b.periodInfo.order - a.periodInfo.order);
  const byPeriod = new Map(records.map(record => [record.periodInfo.key, record]));
  const observations = [];
  for (const record of records) {
    const priorKey = `${record.periodInfo.year - 1}-M${String(record.periodInfo.month).padStart(2, '0')}`;
    const prior = byPeriod.get(priorKey);
    const yoyPct = calculatePercentageChange(record.numericValue, prior?.numericValue);
    if (yoyPct !== null) observations.push({ record, yoyPct });
    if (observations.length === 2) break;
  }

  const latest = observations[0];
  const previous = observations[1];
  const change = latest && previous ? Number((latest.yoyPct - previous.yoyPct).toFixed(12)) : null;
  return {
    yoyPct: latest?.yoyPct ?? null,
    previousYoyPct: previous?.yoyPct ?? null,
    change,
    direction: directionFromChange(change),
  };
}

export function deriveYahooChange5d(rawCloses = [], currentPrice) {
  const closes = rawCloses.map(finiteNumber).filter(value => value !== null && value > 0);
  if (closes.length < 6) return null;
  return calculatePercentageChange(currentPrice, closes.at(-6));
}
