export function selectYahooPreviousClose({ rawCloses = [], rawTimestamps = [], meta = {}, price }) {
  const lastCloseIdx = (() => {
    for (let i = rawCloses.length - 1; i >= 0; i--) {
      if (Number.isFinite(rawCloses[i])) return i;
    }
    return -1;
  })();
  const priorCloseIdx = (() => {
    for (let i = lastCloseIdx - 1; i >= 0; i--) {
      if (Number.isFinite(rawCloses[i])) return i;
    }
    return -1;
  })();

  const lastClose = lastCloseIdx >= 0 ? rawCloses[lastCloseIdx] : null;
  const priorClose = priorCloseIdx >= 0 ? rawCloses[priorCloseIdx] : null;
  const lastCloseTs = lastCloseIdx >= 0 ? rawTimestamps[lastCloseIdx] : null;
  const metaPrev = [meta.regularMarketPreviousClose, meta.previousClose, meta.chartPreviousClose]
    .find(v => Number.isFinite(v) && v > 0) ?? null;

  let prev = null;
  if (Number.isFinite(lastClose) && lastClose > 0) {
    const hasPrior = Number.isFinite(priorClose) && priorClose > 0;
    const marketTime = Number.isFinite(meta?.regularMarketTime) ? meta.regularMarketTime : null;
    const exchangeTz = meta?.exchangeTimezoneName || 'UTC';
    const dayKey = (ts) => new Intl.DateTimeFormat('en-CA', {
      timeZone: exchangeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(ts * 1000));

    if (marketTime && Number.isFinite(lastCloseTs)) {
      const sameTradingDay = dayKey(marketTime) === dayKey(lastCloseTs);
      const utcDay = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
      const sameUtcDay = utcDay(marketTime) === utcDay(lastCloseTs);
      const treatAsCurrentSession = sameTradingDay || sameUtcDay;
      if (treatAsCurrentSession && hasPrior) {
        prev = priorClose;
      } else if (treatAsCurrentSession && Number.isFinite(metaPrev)) {
        prev = metaPrev;
      } else if (!treatAsCurrentSession) {
        prev = lastClose;
      }
    }

    if (!Number.isFinite(prev)) {
      const drift = Math.abs(price - lastClose) / lastClose;
      const canUsePriorOnDrift = hasPrior && Number.isFinite(lastCloseTs);
      if (drift <= 0.002 && canUsePriorOnDrift) {
        prev = priorClose;
      } else if (drift <= 0.002 && Number.isFinite(metaPrev) && metaPrev > 0) {
        prev = metaPrev;
      } else {
        prev = lastClose;
      }
    }
  }

  if (!Number.isFinite(prev)) {
    prev = metaPrev;
  }

  if (!Number.isFinite(prev) && Number.isFinite(lastClose) && lastClose > 0) {
    prev = lastClose;
  }

  return { prev, lastClose, priorClose, lastCloseTs };
}

export function resolveYahooPct({ rawCloses = [], rawTimestamps = [], meta = {}, price }) {
  if (Number.isFinite(meta?.regularMarketChangePercent)) {
    return { pct: meta.regularMarketChangePercent, pctSource: 'regularMarketChangePercent' };
  }

  const metadataPreviousClose = [meta?.regularMarketPreviousClose, meta?.previousClose]
    .find(value => Number.isFinite(value) && value > 0) ?? null;
  if (metadataPreviousClose !== null) {
    return {
      pct: ((price - metadataPreviousClose) / metadataPreviousClose) * 100,
      pctSource: 'derivedPreviousClose'
    };
  }

  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  if (!Number.isFinite(prev) || prev <= 0) throw new Error('No previous close baseline');
  return { pct: ((price - prev) / prev) * 100, pctSource: 'derivedPreviousClose' };
}

export function resolveYahooQuotePct({ quote = {} }) {
  const price = Number.isFinite(quote?.regularMarketPrice) ? quote.regularMarketPrice : null;
  if (!Number.isFinite(price)) return null;

  if (Number.isFinite(quote?.regularMarketChangePercent)) {
    return {
      price,
      pct: quote.regularMarketChangePercent,
      pctSource: 'quoteRegularMarketChangePercent'
    };
  }

  const prev = [quote.regularMarketPreviousClose, quote.previousClose]
    .find(v => Number.isFinite(v) && v > 0) ?? null;
  if (Number.isFinite(prev)) {
    return {
      price,
      pct: ((price - prev) / prev) * 100,
      pctSource: 'quoteDerivedPreviousClose'
    };
  }

  return null;
}
