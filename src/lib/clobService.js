/**
 * Polymarket CLOB Service
 * Handles authentication and order placement via the Polymarket CLOB API
 */

import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { CLOB_ENDPOINTS, CHAIN_IDS, POLYGON_CONTRACTS } from './contracts';

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[clobService]', ...args);
const logError = (...args) => console.error('[clobService]', ...args);

// Signature type for browser wallets (MetaMask, RainbowKit, etc)
const SIGNATURE_TYPE_EOA = 0;

/**
 * Get pre-configured API credentials from environment variables
 * Returns null if not configured
 */
export function getEnvCredentials() {
  const apiKey = import.meta.env.VITE_POLYMARKET_API_KEY;
  const secret = import.meta.env.VITE_POLYMARKET_SECRET;
  const passphrase = import.meta.env.VITE_POLYMARKET_PASSPHRASE;

  log('Checking env credentials:', {
    hasApiKey: !!apiKey,
    hasSecret: !!secret,
    hasPassphrase: !!passphrase,
    apiKeyPrefix: apiKey?.substring(0, 8) + '...',
  });

  if (apiKey && secret && passphrase) {
    return { apiKey, secret, passphrase };
  }
  return null;
}

/**
 * Create an unauthenticated CLOB client for read operations
 */
export function createReadOnlyClient(chainId = CHAIN_IDS.POLYGON) {
  const host = CLOB_ENDPOINTS.MAINNET;
  log('Creating read-only CLOB client:', { host, chainId });
  return new ClobClient(host, chainId);
}

/**
 * Create a Level 1 client with wallet for authentication
 * This client can sign messages but not place orders yet
 */
export function createL1Client(walletClient, chainId = CHAIN_IDS.POLYGON) {
  const host = CLOB_ENDPOINTS.MAINNET;
  log('Creating L1 CLOB client:', {
    host,
    chainId,
    hasWalletClient: !!walletClient,
    walletAddress: walletClient?.account?.address,
  });
  return new ClobClient(host, chainId, walletClient);
}

/**
 * Derive or create API credentials for authenticated operations
 * This prompts the user to sign an EIP-712 message
 * @returns {Promise<{apiKey: string, secret: string, passphrase: string}>}
 */
export async function getApiCredentials(l1Client) {
  log('Getting API credentials via signature...');
  try {
    // createOrDeriveApiKey will check if credentials exist and derive them,
    // or create new ones if they don't exist. Both operations require signing.
    const creds = await l1Client.createOrDeriveApiKey();
    log('API credentials obtained:', {
      hasApiKey: !!creds?.apiKey,
      hasSecret: !!creds?.secret,
      hasPassphrase: !!creds?.passphrase,
    });
    return creds;
  } catch (e) {
    logError('Failed to get API credentials:', e);
    throw e;
  }
}

/**
 * Create a fully authenticated trading client
 * @param walletClient - viem WalletClient from wagmi
 * @param apiCreds - API credentials from getApiCredentials
 * @param funder - The address that holds the USDC (usually same as signer)
 * @param chainId - Chain ID (137 for Polygon mainnet)
 */
export function createTradingClient(walletClient, apiCreds, funder, chainId = CHAIN_IDS.POLYGON) {
  const host = CLOB_ENDPOINTS.MAINNET;
  log('Creating authenticated trading client:', {
    host,
    chainId,
    funder,
    hasWalletClient: !!walletClient,
    hasApiCreds: !!apiCreds,
    signatureType: SIGNATURE_TYPE_EOA,
  });

  const client = new ClobClient(
    host,
    chainId,
    walletClient,
    apiCreds,
    SIGNATURE_TYPE_EOA,
    funder
  );

  log('Trading client created successfully');
  return client;
}

/**
 * Get order book for a token
 * @param client - CLOB client (can be read-only)
 * @param tokenId - The conditional token ID
 */
export async function getOrderBook(client, tokenId) {
  try {
    const book = await client.getOrderBook(tokenId);
    return book;
  } catch (error) {
    console.error('Failed to get order book:', error);
    throw error;
  }
}

/**
 * Get the best bid and ask prices for a token
 */
export async function getBestPrices(client, tokenId) {
  const book = await getOrderBook(client, tokenId);

  const bestBid = book.bids && book.bids.length > 0
    ? parseFloat(book.bids[0].price)
    : 0;

  const bestAsk = book.asks && book.asks.length > 0
    ? parseFloat(book.asks[0].price)
    : 1;

  return { bestBid, bestAsk, spread: bestAsk - bestBid };
}

/**
 * Place a buy order for YES tokens
 * @param client - Authenticated trading client
 * @param tokenId - The conditional token ID to buy
 * @param price - Price per token (0-1)
 * @param size - Number of tokens to buy
 * @param tickSize - Market tick size (e.g., "0.01")
 * @param negRisk - Whether this is a negative risk market
 */
export async function placeBuyOrder(client, tokenId, price, size, tickSize = '0.01', negRisk = true) {
  log('Placing BUY order:', {
    tokenId,
    price,
    size,
    tickSize,
    negRisk,
    orderType: 'GTC',
    side: 'BUY',
  });

  try {
    const orderParams = {
      tokenID: tokenId,
      price,
      side: Side.BUY,
      size,
    };
    const marketParams = { tickSize, negRisk };

    log('Order params:', orderParams);
    log('Market params:', marketParams);

    const response = await client.createAndPostOrder(
      orderParams,
      marketParams,
      OrderType.GTC // Good 'til cancelled
    );

    log('BUY order response:', response);
    return response;
  } catch (error) {
    logError('Failed to place buy order:', error);
    logError('Error details:', {
      message: error.message,
      status: error.status,
      data: error.data,
    });
    throw error;
  }
}

/**
 * Place a sell order for YES tokens
 * @param client - Authenticated trading client
 * @param tokenId - The conditional token ID to sell
 * @param price - Price per token (0-1)
 * @param size - Number of tokens to sell
 * @param tickSize - Market tick size
 * @param negRisk - Whether this is a negative risk market
 */
export async function placeSellOrder(client, tokenId, price, size, tickSize = '0.01', negRisk = true) {
  log('Placing SELL order:', {
    tokenId,
    price,
    size,
    tickSize,
    negRisk,
    orderType: 'GTC',
    side: 'SELL',
  });

  try {
    const orderParams = {
      tokenID: tokenId,
      price,
      side: Side.SELL,
      size,
    };
    const marketParams = { tickSize, negRisk };

    log('Order params:', orderParams);
    log('Market params:', marketParams);

    const response = await client.createAndPostOrder(
      orderParams,
      marketParams,
      OrderType.GTC
    );

    log('SELL order response:', response);
    return response;
  } catch (error) {
    logError('Failed to place sell order:', error);
    logError('Error details:', {
      message: error.message,
      status: error.status,
      data: error.data,
    });
    throw error;
  }
}

/**
 * Place a market buy order (takes best available ask)
 * Uses FOK (Fill or Kill) order type
 */
export async function placeMarketBuyOrder(client, tokenId, size, tickSize = '0.01', negRisk = true) {
  try {
    // For market orders, we use a price of 1.0 to ensure we take any available asks
    const response = await client.createAndPostOrder(
      {
        tokenID: tokenId,
        price: 0.99, // Max price we're willing to pay
        side: Side.BUY,
        size,
      },
      { tickSize, negRisk },
      OrderType.FOK // Fill or Kill - must fill completely or cancel
    );

    return response;
  } catch (error) {
    console.error('Failed to place market buy order:', error);
    throw error;
  }
}

/**
 * Place a market sell order (takes best available bid)
 */
export async function placeMarketSellOrder(client, tokenId, size, tickSize = '0.01', negRisk = true) {
  try {
    const response = await client.createAndPostOrder(
      {
        tokenID: tokenId,
        price: 0.01, // Min price we're willing to accept
        side: Side.SELL,
        size,
      },
      { tickSize, negRisk },
      OrderType.FOK
    );

    return response;
  } catch (error) {
    console.error('Failed to place market sell order:', error);
    throw error;
  }
}

/**
 * Get open orders for the authenticated user
 */
export async function getOpenOrders(client) {
  try {
    const orders = await client.getOrders();
    return orders;
  } catch (error) {
    console.error('Failed to get open orders:', error);
    throw error;
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(client, orderId) {
  try {
    const response = await client.cancelOrder(orderId);
    return response;
  } catch (error) {
    console.error('Failed to cancel order:', error);
    throw error;
  }
}

/**
 * Cancel all open orders
 */
export async function cancelAllOrders(client) {
  try {
    const response = await client.cancelAll();
    return response;
  } catch (error) {
    console.error('Failed to cancel all orders:', error);
    throw error;
  }
}

/**
 * Get trade history for the authenticated user
 */
export async function getTradeHistory(client) {
  try {
    const trades = await client.getTrades();
    return trades;
  } catch (error) {
    console.error('Failed to get trade history:', error);
    throw error;
  }
}

// Re-export useful types
export { Side, OrderType };
