/**
 * Hook for fetching user trade history and calculating cost basis
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWalletClient, useChainId } from 'wagmi';

import {
  createL1Client,
  createTradingClient,
  getApiCredentials,
  getEnvCredentials,
  getTradeHistory,
} from '../lib/clobService';
import { CHAIN_IDS } from '../lib/contracts';

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[useTradeHistory]', ...args);

// Cache for credentials (shared with useTrading)
let cachedCredentials = null;

/**
 * Calculate cost basis from trade history
 * Cost basis = total USDC spent on BUY trades for specified token IDs
 */
function calculateCostBasis(trades, tokenIds) {
  if (!trades || trades.length === 0) return { costBasis: 0, trades: [] };

  const tokenIdSet = new Set(tokenIds);
  let costBasis = 0;
  const relevantTrades = [];

  for (const trade of trades) {
    // Check if this trade is for one of our tokens
    const tradeTokenId = trade.asset_id || trade.token_id || trade.tokenId;
    if (!tokenIdSet.has(tradeTokenId)) continue;

    const side = (trade.side || '').toUpperCase();
    const price = parseFloat(trade.price) || 0;
    const size = parseFloat(trade.size) || parseFloat(trade.amount) || 0;
    const timestamp = trade.timestamp || trade.created_at || trade.match_time;

    relevantTrades.push({
      tokenId: tradeTokenId,
      side,
      price,
      size,
      value: price * size,
      timestamp: typeof timestamp === 'number' ? timestamp * 1000 : new Date(timestamp).getTime(),
    });

    // BUY trades add to cost basis
    if (side === 'BUY') {
      costBasis += price * size;
    }
    // SELL trades could reduce cost basis (realized gains/losses)
    // For simplicity, we're just tracking total spent for now
  }

  log('Cost basis calculated:', {
    totalTrades: trades.length,
    relevantTrades: relevantTrades.length,
    costBasis,
  });

  return { costBasis, trades: relevantTrades };
}

/**
 * Hook to fetch user's trade history and calculate cost basis
 */
export function useTradeHistory(tokenIds = []) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [trades, setTrades] = useState([]);
  const [costBasis, setCostBasis] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const isOnPolygon = chainId === CHAIN_IDS.POLYGON;

  /**
   * Fetch trade history from CLOB API
   */
  const fetchTrades = useCallback(async () => {
    if (!walletClient || !address || !isOnPolygon) {
      log('Cannot fetch trades: missing requirements', {
        hasWallet: !!walletClient,
        address,
        isOnPolygon,
      });
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get or create credentials
      let creds = getEnvCredentials();

      if (!creds && !cachedCredentials) {
        log('Deriving API credentials for trade history...');
        const l1Client = createL1Client(walletClient, CHAIN_IDS.POLYGON);
        creds = await getApiCredentials(l1Client);
        cachedCredentials = creds;
      } else if (cachedCredentials) {
        creds = cachedCredentials;
      }

      setIsAuthenticated(true);

      // Create trading client
      const client = createTradingClient(walletClient, creds, address, CHAIN_IDS.POLYGON);

      // Fetch trade history
      log('Fetching trade history...');
      const allTrades = await getTradeHistory(client);
      log('Trade history received:', { count: allTrades?.length || 0 });

      // Calculate cost basis for specified token IDs
      const { costBasis: calculatedCostBasis, trades: relevantTrades } = calculateCostBasis(
        allTrades,
        tokenIds
      );

      setTrades(relevantTrades);
      setCostBasis(calculatedCostBasis);
      setIsLoading(false);

      return { trades: relevantTrades, costBasis: calculatedCostBasis };
    } catch (e) {
      console.error('Failed to fetch trade history:', e);
      setError(e);
      setIsLoading(false);
      return null;
    }
  }, [walletClient, address, isOnPolygon, tokenIds]);

  // Fetch trades when token IDs change and we're authenticated
  useEffect(() => {
    if (tokenIds.length > 0 && isConnected && isOnPolygon && walletClient) {
      // Don't auto-fetch, require explicit call to avoid unwanted signature prompts
      // fetchTrades();
    }
  }, [tokenIds, isConnected, isOnPolygon, walletClient]);

  return {
    trades,
    costBasis,
    isLoading,
    error,
    isAuthenticated,
    fetchTrades,
    refetch: fetchTrades,
  };
}

/**
 * Alternative: Fetch cost basis from PolygonScan (no auth required)
 * This checks USDC transfers TO the user's address FROM the CTF Exchange
 */
export async function fetchCostBasisFromPolygonScan(address, apiKey = null) {
  // PolygonScan API endpoint for ERC-20 token transfers
  // Note: This requires a free API key from PolygonScan
  const baseUrl = 'https://api.polygonscan.com/api';

  // USDC.e contract on Polygon
  const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

  const params = new URLSearchParams({
    module: 'account',
    action: 'tokentx',
    address: address,
    contractaddress: USDC_CONTRACT,
    sort: 'desc',
    page: '1',
    offset: '100', // Last 100 transfers
  });

  if (apiKey) {
    params.append('apikey', apiKey);
  }

  try {
    const response = await fetch(`${baseUrl}?${params}`);
    const data = await response.json();

    if (data.status !== '1' || !data.result) {
      log('PolygonScan API returned no results');
      return { costBasis: 0, transfers: [] };
    }

    // Calculate cost basis from USDC transfers TO exchange (buying tokens)
    // These are transfers FROM user TO exchange
    let costBasis = 0;
    const relevantTransfers = [];

    for (const tx of data.result) {
      // Transfers FROM user (spending USDC to buy tokens)
      if (tx.from.toLowerCase() === address.toLowerCase()) {
        const value = parseInt(tx.value) / 1e6; // USDC has 6 decimals
        costBasis += value;
        relevantTransfers.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value,
          timestamp: parseInt(tx.timeStamp) * 1000,
        });
      }
    }

    log('Cost basis from PolygonScan:', { costBasis, transfers: relevantTransfers.length });

    return { costBasis, transfers: relevantTransfers };
  } catch (e) {
    console.error('Failed to fetch from PolygonScan:', e);
    return { costBasis: 0, transfers: [] };
  }
}
