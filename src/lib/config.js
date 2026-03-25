/**
 * Vaulto Trading App Configuration
 */

export const CONFIG = {
  mode: 'mainnet', // 'mock' | 'testnet' | 'mainnet'

  // Default floor parameters (matching whitepaper)
  floorL: 0.20,
  floorS: 0.15,
  numBands: 8,

  // Polymarket API
  polymarket: {
    eventSlug: 'spacex-ipo-closing-market-cap-higher-strikes',
    proxyBase: '/api/gamma',
    directBase: 'https://gamma-api.polymarket.com',
    clobBase: 'https://clob.polymarket.com',
  },

  // Trading configuration
  trading: {
    tickSize: '0.01', // Minimum tick size for SpaceX IPO markets
    negRisk: true, // SpaceX IPO markets use negative risk
    slippageBps: 50, // 0.5% slippage tolerance
  },

  // Refresh intervals
  priceRefreshMs: 30000, // 30 seconds
};

/**
 * Band token IDs mapping
 * These are the ERC-1155 token IDs for each valuation band's YES token
 * Token IDs are fetched dynamically from Gamma API in polymarket.js
 * This is populated at runtime by fetchMarketTokenIds()
 */
export let bandTokenIds = [];

/**
 * Set band token IDs (called from polymarket.js after fetching)
 */
export function setBandTokenIds(ids) {
  bandTokenIds = ids;
}

// Band metadata - labels and midpoints matching whitepaper
export const BAND_META = [
  { index: 0, label: 'No IPO', midpoint: 350 },
  { index: 1, label: '< $1.0T', midpoint: 750 },
  { index: 2, label: '$1.0 - 1.2T', midpoint: 1100 },
  { index: 3, label: '$1.2 - 1.4T', midpoint: 1300 },
  { index: 4, label: '$1.4 - 1.6T', midpoint: 1500 },
  { index: 5, label: '$1.6 - 1.8T', midpoint: 1700 },
  { index: 6, label: '$1.8 - 2.0T', midpoint: 1900 },
  { index: 7, label: '$2.0T+', midpoint: 2300 },
];

// Fallback prices if API is unavailable
export const FALLBACK_PRICES = [
  { label: 'No IPO', price: 0.047 },
  { label: '< $1.0T', price: 0.05 },
  { label: '$1.0 - 1.2T', price: 0.033 },
  { label: '$1.2 - 1.4T', price: 0.030 },
  { label: '$1.4 - 1.6T', price: 0.047 },
  { label: '$1.6 - 1.8T', price: 0.082 },
  { label: '$1.8 - 2.0T', price: 0.16 },
  { label: '$2.0T+', price: 0.57 },
];
