/**
 * Polymarket API Integration
 */

import { CONFIG, BAND_META, FALLBACK_PRICES, setBandTokenIds } from './config';

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[polymarket]', ...args);

function getApiBase() {
  if (typeof location !== 'undefined' &&
      (location.protocol === 'http:' || location.protocol === 'https:')) {
    return `${location.origin}${CONFIG.polymarket.proxyBase}`;
  }
  return CONFIG.polymarket.directBase;
}

/**
 * Fetch live band prices from Polymarket
 * Also extracts token IDs for on-chain trading
 */
export async function fetchBandPrices() {
  const apiBase = getApiBase();
  const url = `${apiBase}/events/slug/${CONFIG.polymarket.eventSlug}`;

  log('Fetching band prices:', { url, eventSlug: CONFIG.polymarket.eventSlug });

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    log('API response received');

    const event = await res.json();
    const markets = [...(event.markets || [])].sort(
      (a, b) => Number(a.groupItemThreshold) - Number(b.groupItemThreshold)
    );

    const bands = [];
    const tokenIds = [];

    for (let i = 0; i < markets.length && i < BAND_META.length; i++) {
      const market = markets[i];
      const meta = BAND_META[i];

      let price = 0;
      try {
        const pricesArr = JSON.parse(market.outcomePrices || '["0","0"]');
        price = parseFloat(pricesArr[0]);
      } catch (e) {
        price = 0;
      }

      const volume = typeof market.volumeNum === 'number'
        ? market.volumeNum
        : parseFloat(String(market.volume || '0')) || 0;

      // Extract token IDs for YES outcome
      // clobTokenIds format: [yesTokenId, noTokenId]
      let yesTokenId = null;
      try {
        const clobIds = JSON.parse(market.clobTokenIds || '[]');
        yesTokenId = clobIds[0] || null;
      } catch (e) {
        yesTokenId = null;
      }

      bands.push({
        index: i,
        label: meta.label,
        midpoint: meta.midpoint,
        price,
        volume,
        tokenId: yesTokenId,
        conditionId: market.conditionId || null,
        questionId: market.questionId || null,
        negRisk: market.negRisk || false,
      });

      if (yesTokenId) {
        tokenIds.push(yesTokenId);
      }
    }

    // Update global token IDs
    if (tokenIds.length > 0) {
      log('Setting band token IDs:', tokenIds);
      setBandTokenIds(tokenIds);
    } else {
      log('WARNING: No token IDs found in market data');
    }

    log('fetchBandPrices complete:', {
      bandsCount: bands.length,
      tokenIdsCount: tokenIds.length,
      bands: bands.map(b => ({ label: b.label, price: b.price, tokenId: b.tokenId })),
    });

    return { bands, event, tokenIds, usedFallback: false };
  } catch (error) {
    console.warn('Failed to fetch Polymarket data, using fallback:', error);

    const bands = FALLBACK_PRICES.map((fb, i) => ({
      index: i,
      label: BAND_META[i].label,
      midpoint: BAND_META[i].midpoint,
      price: fb.price,
      volume: 0,
      tokenId: null,
      conditionId: null,
      questionId: null,
      negRisk: false,
    }));

    const event = {
      volume: 384729,
      endDate: '2027-12-31T00:00:00Z',
    };

    return { bands, event, tokenIds: [], usedFallback: true };
  }
}

/**
 * Fetch token IDs for a specific event
 * Returns mapping of band index to token ID
 */
export async function fetchMarketTokenIds(eventSlug = CONFIG.polymarket.eventSlug) {
  const apiBase = getApiBase();
  const url = `${apiBase}/events/slug/${eventSlug}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const event = await res.json();
    const markets = [...(event.markets || [])].sort(
      (a, b) => Number(a.groupItemThreshold) - Number(b.groupItemThreshold)
    );

    const tokenIdMap = {};
    const tokenIds = [];

    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];

      try {
        const clobIds = JSON.parse(market.clobTokenIds || '[]');
        const yesTokenId = clobIds[0] || null;

        if (yesTokenId) {
          tokenIdMap[i] = {
            yesTokenId,
            noTokenId: clobIds[1] || null,
            conditionId: market.conditionId,
            questionId: market.questionId,
            negRisk: market.negRisk || false,
          };
          tokenIds.push(yesTokenId);
        }
      } catch (e) {
        console.warn(`Failed to parse token IDs for market ${i}:`, e);
      }
    }

    // Update global token IDs
    setBandTokenIds(tokenIds);

    return { tokenIdMap, tokenIds, markets };
  } catch (error) {
    console.error('Failed to fetch market token IDs:', error);
    return { tokenIdMap: {}, tokenIds: [], markets: [] };
  }
}

/**
 * Get market info for a specific token ID
 */
export async function getMarketByTokenId(tokenId) {
  const apiBase = getApiBase();
  const url = `${apiBase}/markets?clob_token_ids=${tokenId}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const markets = await res.json();
    return markets[0] || null;
  } catch (error) {
    console.error('Failed to fetch market by token ID:', error);
    return null;
  }
}

/**
 * Format end date for display
 */
export function formatEndDate(iso) {
  if (!iso) return 'December 31, 2027';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format currency for display
 */
export function formatUsd(value) {
  return '$' + Math.round(value).toLocaleString();
}

/**
 * Fetch historical prices for a single token
 * @param {string} tokenId - The market token ID
 * @param {string} interval - Time range: 'max', 'all', '1m', '1w', '1d', '6h', '1h'
 * @param {number} fidelity - Granularity in minutes (default 60 = 1 hour)
 * @param {number} startTs - Optional start timestamp (Unix seconds)
 * @param {number} endTs - Optional end timestamp (Unix seconds)
 */
export async function fetchTokenPriceHistory(tokenId, interval = '1m', fidelity = 60, startTs = null, endTs = null) {
  // Use CLOB API directly (not proxied gamma API)
  const clobBase = typeof location !== 'undefined'
    ? `${location.origin}/api/clob`
    : 'https://clob.polymarket.com';

  let url = `${clobBase}/prices-history?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`;
  if (startTs) url += `&startTs=${startTs}`;
  if (endTs) url += `&endTs=${endTs}`;

  log('Fetching price history:', { tokenId, interval, fidelity, startTs, endTs, url });

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    log('Price history response:', { tokenId, points: data.history?.length || 0 });

    return data.history || [];
  } catch (error) {
    console.warn(`Failed to fetch price history for ${tokenId}:`, error);
    return [];
  }
}

/**
 * Fetch historical prices for all bands and compute implied valuation over time
 * @param {Array} bands - Array of band objects with tokenId, label, midpoint
 * @param {string} interval - Time range: '1m' (1 month), '1w', etc.
 * @param {number} fidelity - Granularity in minutes
 * @returns {Array} Array of { timestamp, impliedValuation, bandPrices }
 */
export async function fetchHistoricalImpliedValuation(bands, interval = '1m', fidelity = 60) {
  if (!bands || bands.length === 0) {
    log('No bands provided for historical valuation');
    return [];
  }

  // Filter bands with valid token IDs
  const validBands = bands.filter(b => b.tokenId);
  if (validBands.length === 0) {
    log('No valid token IDs in bands');
    return [];
  }

  log('Fetching historical prices for bands:', validBands.map(b => b.label));

  // Fetch all price histories in parallel
  const historyPromises = validBands.map(band =>
    fetchTokenPriceHistory(band.tokenId, interval, fidelity)
      .then(history => ({ band, history }))
  );

  const results = await Promise.all(historyPromises);

  // Build a map of timestamp -> { bandIndex: price }
  const timeMap = new Map();

  for (const { band, history } of results) {
    for (const point of history) {
      const ts = point.t * 1000; // Convert to milliseconds
      if (!timeMap.has(ts)) {
        timeMap.set(ts, {});
      }
      timeMap.get(ts)[band.index] = point.p;
    }
  }

  // Sort timestamps and calculate implied valuation at each point
  const sortedTimestamps = Array.from(timeMap.keys()).sort((a, b) => a - b);

  // Track last known prices for interpolation
  const lastPrices = {};

  const valuationHistory = sortedTimestamps.map(timestamp => {
    const prices = timeMap.get(timestamp);

    // Update last known prices
    for (const [idx, price] of Object.entries(prices)) {
      lastPrices[idx] = price;
    }

    // Calculate implied valuation using probability-weighted average
    let totalWeight = 0;
    let weightedSum = 0;

    for (const band of validBands) {
      const price = lastPrices[band.index] ?? 0;
      const midpoint = band.midpoint || BAND_META[band.index]?.midpoint || 0;

      // Skip "No IPO" band (usually has midpoint of 0 or label contains "No IPO")
      if (band.label?.includes('No IPO') || midpoint === 0) continue;

      weightedSum += price * midpoint;
      totalWeight += price;
    }

    const impliedValuation = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return {
      timestamp,
      impliedValuation,
      bandPrices: { ...lastPrices },
    };
  });

  log('Historical valuation computed:', {
    points: valuationHistory.length,
    firstTs: valuationHistory[0]?.timestamp,
    lastTs: valuationHistory[valuationHistory.length - 1]?.timestamp,
  });

  return valuationHistory;
}

/**
 * Fetch 1-day price history and calculate portfolio value over time
 * @param {Array} bandBalances - Array of { tokenId, balance, label, index }
 * @param {number} fidelity - Granularity in minutes (default 5 = 5 minutes)
 * @returns {Array} Array of { timestamp, portfolioValue, bandValues }
 */
export async function fetchHistoricalPortfolioValue(bandBalances, fidelity = 5) {
  if (!bandBalances || bandBalances.length === 0) {
    log('No band balances provided for portfolio history');
    return [];
  }

  // Filter bands with valid token IDs and positive balances
  const validBands = bandBalances.filter(b => b.tokenId && b.balance > 0);
  if (validBands.length === 0) {
    log('No valid token balances for portfolio history');
    return [];
  }

  log('Fetching 1-day price history for portfolio:', validBands.map(b => b.label));

  // Fetch all price histories in parallel (1 day interval)
  const historyPromises = validBands.map(band =>
    fetchTokenPriceHistory(band.tokenId, '1d', fidelity)
      .then(history => ({ band, history }))
  );

  const results = await Promise.all(historyPromises);

  // Build a map of timestamp -> { tokenId: price }
  const timeMap = new Map();

  for (const { band, history } of results) {
    for (const point of history) {
      const ts = point.t * 1000; // Convert to milliseconds
      if (!timeMap.has(ts)) {
        timeMap.set(ts, {});
      }
      timeMap.get(ts)[band.tokenId] = point.p;
    }
  }

  // Sort timestamps
  const sortedTimestamps = Array.from(timeMap.keys()).sort((a, b) => a - b);

  // Track last known prices for interpolation
  const lastPrices = {};

  const portfolioHistory = sortedTimestamps.map(timestamp => {
    const prices = timeMap.get(timestamp);

    // Update last known prices
    for (const [tokenId, price] of Object.entries(prices)) {
      lastPrices[tokenId] = price;
    }

    // Calculate portfolio value at this timestamp
    let portfolioValue = 0;
    const bandValues = {};

    for (const band of validBands) {
      const price = lastPrices[band.tokenId] ?? 0;
      const value = band.balance * price;
      portfolioValue += value;
      bandValues[band.tokenId] = { price, value, balance: band.balance };
    }

    return {
      timestamp,
      portfolioValue,
      bandValues,
    };
  });

  log('Portfolio history computed:', {
    points: portfolioHistory.length,
    firstTs: portfolioHistory[0]?.timestamp,
    lastTs: portfolioHistory[portfolioHistory.length - 1]?.timestamp,
    currentValue: portfolioHistory[portfolioHistory.length - 1]?.portfolioValue,
  });

  return portfolioHistory;
}
