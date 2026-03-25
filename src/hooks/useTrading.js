/**
 * Hook for Polymarket CLOB trading operations
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useWalletClient, useChainId } from 'wagmi';

import {
  createL1Client,
  createTradingClient,
  getApiCredentials,
  getEnvCredentials,
  placeBuyOrder,
  placeSellOrder,
  getOrderBook,
  getBestPrices,
} from '../lib/clobService';
import { CHAIN_IDS } from '../lib/contracts';
import { CONFIG } from '../lib/config';

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[useTrading]', ...args);
const logError = (...args) => console.error('[useTrading]', ...args);

// Store credentials in memory (per session)
let cachedCredentials = null;
let cachedAddress = null;

/**
 * Hook for Polymarket trading
 */
export function useTrading() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [isPending, setIsPending] = useState(false);
  const [pendingTx, setPendingTx] = useState(null);
  const [txHistory, setTxHistory] = useState([]);
  const [error, setError] = useState(null);

  const tradingClientRef = useRef(null);

  // Log initial state
  useEffect(() => {
    log('useTrading initialized:', {
      address,
      isConnected,
      chainId,
      expectedChainId: CHAIN_IDS.POLYGON,
      isOnPolygon: chainId === CHAIN_IDS.POLYGON,
      hasWalletClient: !!walletClient,
      walletClientAccount: walletClient?.account?.address,
    });
  }, [address, isConnected, chainId, walletClient]);

  // Clear cached credentials when address changes
  useEffect(() => {
    if (address !== cachedAddress) {
      log('Address changed, clearing cached credentials:', {
        oldAddress: cachedAddress,
        newAddress: address,
      });
      cachedCredentials = null;
      cachedAddress = address;
      setIsAuthenticated(false);
      tradingClientRef.current = null;
    }
  }, [address]);

  // Check if on correct chain
  const isOnPolygon = chainId === CHAIN_IDS.POLYGON;

  log('Chain check:', { chainId, isOnPolygon, expectedChainId: CHAIN_IDS.POLYGON });

  /**
   * Authenticate with Polymarket CLOB
   * First checks for env credentials, then prompts EIP-712 signature if needed
   */
  const authenticate = useCallback(async () => {
    log('authenticate() called:', {
      hasWalletClient: !!walletClient,
      walletClientAccount: walletClient?.account?.address,
      address,
      isOnPolygon,
      chainId,
    });

    if (!walletClient || !address) {
      const err = new Error('Wallet not connected');
      logError('Authentication failed - no wallet:', err);
      setAuthError(err);
      return false;
    }

    if (!isOnPolygon) {
      const err = new Error(`Please switch to Polygon network (current: ${chainId}, expected: ${CHAIN_IDS.POLYGON})`);
      logError('Authentication failed - wrong chain:', err);
      setAuthError(err);
      return false;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // Check for pre-configured credentials from .env
      let creds = getEnvCredentials();

      if (creds) {
        log('Using pre-configured API credentials from .env');
      } else {
        log('No env credentials, creating L1 client for signature...');
        // Create L1 client for authentication
        const l1Client = createL1Client(walletClient, CHAIN_IDS.POLYGON);

        // Get or derive API credentials (prompts signature)
        log('Requesting API credentials via signature...');
        creds = await getApiCredentials(l1Client);
        log('Got credentials from signature');
      }

      cachedCredentials = creds;
      log('Credentials cached, creating trading client...');

      // Create authenticated trading client
      tradingClientRef.current = createTradingClient(
        walletClient,
        creds,
        address,
        CHAIN_IDS.POLYGON
      );

      log('Trading client created, authentication successful');
      setIsAuthenticated(true);
      setIsAuthenticating(false);
      return true;
    } catch (e) {
      logError('Authentication failed:', e);
      logError('Error details:', {
        message: e.message,
        stack: e.stack,
      });
      setAuthError(e);
      setIsAuthenticating(false);
      return false;
    }
  }, [walletClient, address, isOnPolygon, chainId]);

  /**
   * Ensure we have an authenticated client
   */
  const ensureAuthenticated = useCallback(async () => {
    if (isAuthenticated && tradingClientRef.current) {
      return true;
    }

    // Check if we have cached credentials
    if (cachedCredentials && walletClient && address) {
      tradingClientRef.current = createTradingClient(
        walletClient,
        cachedCredentials,
        address,
        CHAIN_IDS.POLYGON
      );
      setIsAuthenticated(true);
      return true;
    }

    // Need to authenticate
    return authenticate();
  }, [isAuthenticated, walletClient, address, authenticate]);

  /**
   * Buy YES tokens for multiple bands with weights
   * @param orders - Array of { tokenId, price, size, tickSize, negRisk }
   */
  const buyYesTokens = useCallback(async (orders) => {
    log('buyYesTokens called:', {
      orderCount: orders?.length,
      orders,
      isConnected,
      isAuthenticated,
      hasTradingClient: !!tradingClientRef.current,
    });

    if (!isConnected) {
      const err = new Error('Wallet not connected');
      logError('Buy failed - not connected:', err);
      setError(err);
      return null;
    }

    // Ensure authenticated
    log('Ensuring authentication...');
    const authed = await ensureAuthenticated();
    if (!authed) {
      const err = new Error('Authentication required');
      logError('Buy failed - auth required:', err);
      setError(err);
      return null;
    }

    log('Authenticated, processing orders...');
    setIsPending(true);
    setError(null);
    const results = [];

    try {
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        log(`Processing order ${i + 1}/${orders.length}:`, order);

        setPendingTx({
          type: 'buy',
          tokenId: order.tokenId,
          price: order.price,
          size: order.size,
          status: 'pending',
        });

        log('Calling placeBuyOrder...');
        const result = await placeBuyOrder(
          tradingClientRef.current,
          order.tokenId,
          order.price,
          order.size,
          order.tickSize || CONFIG.trading?.tickSize || '0.01',
          order.negRisk ?? CONFIG.trading?.negRisk ?? true
        );

        log(`Order ${i + 1} result:`, result);

        results.push({
          ...order,
          result,
          timestamp: Date.now(),
        });

        // Add to history
        setTxHistory((prev) => [
          {
            type: 'buy',
            ...order,
            result,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      }

      log('All orders completed:', results);
      setPendingTx(null);
      setIsPending(false);
      return results;
    } catch (e) {
      logError('Buy order failed:', e);
      logError('Error details:', {
        message: e.message,
        status: e.status,
        data: e.data,
        stack: e.stack,
      });
      setError(e);
      setPendingTx(null);
      setIsPending(false);
      return null;
    }
  }, [isConnected, ensureAuthenticated]);

  /**
   * Sell YES tokens for multiple bands
   * @param orders - Array of { tokenId, price, size, tickSize, negRisk }
   */
  const sellYesTokens = useCallback(async (orders) => {
    if (!isConnected) {
      setError(new Error('Wallet not connected'));
      return null;
    }

    const authed = await ensureAuthenticated();
    if (!authed) {
      setError(new Error('Authentication required'));
      return null;
    }

    setIsPending(true);
    setError(null);
    const results = [];

    try {
      for (const order of orders) {
        setPendingTx({
          type: 'sell',
          tokenId: order.tokenId,
          price: order.price,
          size: order.size,
          status: 'pending',
        });

        const result = await placeSellOrder(
          tradingClientRef.current,
          order.tokenId,
          order.price,
          order.size,
          order.tickSize || CONFIG.trading?.tickSize || '0.01',
          order.negRisk ?? CONFIG.trading?.negRisk ?? true
        );

        results.push({
          ...order,
          result,
          timestamp: Date.now(),
        });

        setTxHistory((prev) => [
          {
            type: 'sell',
            ...order,
            result,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      }

      setPendingTx(null);
      setIsPending(false);
      return results;
    } catch (e) {
      console.error('Sell order failed:', e);
      setError(e);
      setPendingTx(null);
      setIsPending(false);
      return null;
    }
  }, [isConnected, ensureAuthenticated]);

  /**
   * Get current prices for a token
   */
  const getTokenPrices = useCallback(async (tokenId) => {
    try {
      const client = tradingClientRef.current || createL1Client(null, CHAIN_IDS.POLYGON);
      return await getBestPrices(client, tokenId);
    } catch (e) {
      console.error('Failed to get token prices:', e);
      return null;
    }
  }, []);

  /**
   * Clear any pending errors
   */
  const clearError = useCallback(() => {
    setError(null);
    setAuthError(null);
  }, []);

  return {
    // Authentication
    isAuthenticated,
    isAuthenticating,
    authenticate,
    authError,

    // Trading
    buyYesTokens,
    sellYesTokens,
    getTokenPrices,

    // State
    isPending,
    pendingTx,
    txHistory,
    error,
    clearError,

    // Chain state
    isOnPolygon,
    isConnected,
  };
}

/**
 * Hook to fetch order book prices for display
 */
export function useOrderBookPrices(tokenIds) {
  const [prices, setPrices] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPrices = useCallback(async () => {
    if (!tokenIds || tokenIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const client = createL1Client(null, CHAIN_IDS.POLYGON);
      const newPrices = {};

      for (const tokenId of tokenIds) {
        try {
          const { bestBid, bestAsk, spread } = await getBestPrices(client, tokenId);
          newPrices[tokenId] = { bestBid, bestAsk, spread };
        } catch (e) {
          console.warn(`Failed to fetch prices for ${tokenId}:`, e);
          newPrices[tokenId] = { bestBid: 0, bestAsk: 1, spread: 1 };
        }
      }

      setPrices(newPrices);
    } catch (e) {
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [tokenIds]);

  useEffect(() => {
    fetchPrices();
    // Refresh prices periodically
    const interval = setInterval(fetchPrices, CONFIG.priceRefreshMs);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return { prices, isLoading, error, refetch: fetchPrices };
}
