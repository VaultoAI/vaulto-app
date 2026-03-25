/**
 * Polygon Contract Addresses for Polymarket Trading
 */

export const POLYGON_CONTRACTS = {
  // Polymarket CTF Exchange (ERC-1155 conditional tokens trading)
  CTF_EXCHANGE: '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e',

  // Conditional Tokens Framework (ERC-1155 positions)
  CONDITIONAL_TOKENS: '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',

  // USDC.e on Polygon (bridged USDC) - THIS IS WHAT POLYMARKET USES
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',

  // Native USDC on Polygon (for reference - NOT used by Polymarket)
  USDC_NATIVE: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',

  // Neg Risk CTF Exchange (for neg-risk markets)
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',

  // Neg Risk Adapter
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
};

// Log contract addresses on load
console.log('[contracts] Polygon contract addresses loaded:', POLYGON_CONTRACTS);

// Chain IDs
export const CHAIN_IDS = {
  POLYGON: 137,
  POLYGON_AMOY: 80002,
};

// CLOB API endpoints
// Use proxy in browser to avoid CORS issues
function getClobEndpoint() {
  if (typeof window !== 'undefined' && window.location) {
    // Running in browser - use proxy
    return `${window.location.origin}/api/clob`;
  }
  // Running in Node.js or SSR - use direct endpoint
  return 'https://clob.polymarket.com';
}

export const CLOB_ENDPOINTS = {
  MAINNET: getClobEndpoint(),
  TESTNET: getClobEndpoint(), // Same endpoint, different chain ID
};

console.log('[contracts] CLOB endpoint:', CLOB_ENDPOINTS.MAINNET);

// USDC decimals
export const USDC_DECIMALS = 6;
