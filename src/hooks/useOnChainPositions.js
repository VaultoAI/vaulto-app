/**
 * Hook for tracking on-chain ERC-1155 positions
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';

import { POLYGON_CONTRACTS } from '../lib/contracts';
import { ERC1155_ABI } from '../lib/abis/erc1155';
import { CONFIG } from '../lib/config';
import { calcLongWeight, calcShortWeight, calcLongCost, calcShortCost } from '../lib/pricing';

/**
 * Hook to query ERC-1155 balances for band token IDs
 * @param tokenIds - Array of token IDs from bandTokenIds config
 */
export function useOnChainPositions(tokenIds, bands) {
  const { address, isConnected } = useAccount();

  // Build contract reads for each token ID
  const contracts = useMemo(() => {
    if (!address || !tokenIds || tokenIds.length === 0) return [];

    return tokenIds.map((tokenId) => ({
      address: POLYGON_CONTRACTS.CONDITIONAL_TOKENS,
      abi: ERC1155_ABI,
      functionName: 'balanceOf',
      args: [address, BigInt(tokenId)],
    }));
  }, [address, tokenIds]);

  const {
    data: balances,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: CONFIG.priceRefreshMs,
    },
  });

  // Calculate weighted LONG/SHORT values from raw balances
  const positions = useMemo(() => {
    if (!balances || balances.length === 0 || !bands || bands.length === 0) {
      return {
        bandBalances: [],
        totalLongTokens: 0,
        totalShortTokens: 0,
        longValue: 0,
        shortValue: 0,
        rawBalances: [],
      };
    }

    const numBands = balances.length;
    const floorL = CONFIG.floorL;
    const floorS = CONFIG.floorS;

    // Extract raw balances
    const rawBalances = balances.map((result, i) => {
      if (result.status === 'success') {
        return {
          tokenId: tokenIds[i],
          balance: Number(result.result) / 1e6, // Convert from 6 decimals
          bandIndex: i,
          label: bands[i]?.label || `Band ${i}`,
        };
      }
      return {
        tokenId: tokenIds[i],
        balance: 0,
        bandIndex: i,
        label: bands[i]?.label || `Band ${i}`,
      };
    });

    // Calculate weighted positions
    // For LONG: tokens in higher bands contribute more value
    // For SHORT: tokens in lower bands contribute more value
    let totalLongTokens = 0;
    let totalShortTokens = 0;
    let longValue = 0;
    let shortValue = 0;

    const bandBalances = rawBalances.map((band, i) => {
      const longWeight = calcLongWeight(i, numBands, floorL);
      const shortWeight = calcShortWeight(i, numBands, floorS);

      // Each YES token can be viewed as contributing to both LONG and SHORT
      // based on its band position
      const longContribution = band.balance * longWeight;
      const shortContribution = band.balance * shortWeight;

      totalLongTokens += band.balance;
      totalShortTokens += band.balance;
      longValue += longContribution;
      shortValue += shortContribution;

      return {
        ...band,
        longWeight,
        shortWeight,
        longContribution,
        shortContribution,
      };
    });

    return {
      bandBalances,
      totalLongTokens,
      totalShortTokens,
      longValue,
      shortValue,
      rawBalances,
    };
  }, [balances, tokenIds, bands]);

  // Calculate current P&L based on market prices
  const calculatePnL = useCallback((costBasis) => {
    if (!bands || bands.length === 0) {
      return { longPnl: 0, shortPnl: 0, longPnlPercent: 0, shortPnlPercent: 0 };
    }

    const currentLongCost = calcLongCost(bands);
    const currentShortCost = calcShortCost(bands);

    const longPnl = positions.longValue - (costBasis?.long || 0);
    const shortPnl = positions.shortValue - (costBasis?.short || 0);

    const longPnlPercent = costBasis?.long > 0
      ? (longPnl / costBasis.long) * 100
      : 0;
    const shortPnlPercent = costBasis?.short > 0
      ? (shortPnl / costBasis.short) * 100
      : 0;

    return { longPnl, shortPnl, longPnlPercent, shortPnlPercent };
  }, [bands, positions]);

  // Check if user has any positions
  const hasPositions = useMemo(() => {
    return positions.totalLongTokens > 0 || positions.totalShortTokens > 0;
  }, [positions]);

  return {
    positions,
    hasPositions,
    calculatePnL,
    isLoading,
    isError,
    error,
    refetch,
    isConnected,
  };
}

/**
 * Hook to get position summary for display
 */
export function usePositionSummary(tokenIds, bands) {
  const { positions, hasPositions, isLoading, refetch } = useOnChainPositions(tokenIds, bands);

  const summary = useMemo(() => {
    if (!hasPositions || !bands) {
      return null;
    }

    const longCost = calcLongCost(bands);
    const shortCost = calcShortCost(bands);

    // Calculate current value based on market prices
    const longMarketValue = positions.longValue * longCost;
    const shortMarketValue = positions.shortValue * shortCost;

    return {
      long: {
        tokens: positions.totalLongTokens,
        weightedValue: positions.longValue,
        marketValue: longMarketValue,
        perTokenCost: longCost,
      },
      short: {
        tokens: positions.totalShortTokens,
        weightedValue: positions.shortValue,
        marketValue: shortMarketValue,
        perTokenCost: shortCost,
      },
      bandBreakdown: positions.bandBalances,
    };
  }, [positions, hasPositions, bands]);

  return { summary, hasPositions, isLoading, refetch };
}

/**
 * Hook to batch fetch all token balances efficiently
 */
export function useBatchBalances(tokenIds) {
  const { address, isConnected } = useAccount();

  // Use balanceOfBatch for efficiency
  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: address && tokenIds?.length > 0 ? [{
      address: POLYGON_CONTRACTS.CONDITIONAL_TOKENS,
      abi: ERC1155_ABI,
      functionName: 'balanceOfBatch',
      args: [
        Array(tokenIds.length).fill(address),
        tokenIds.map(id => BigInt(id)),
      ],
    }] : [],
    query: {
      enabled: isConnected && tokenIds?.length > 0,
    },
  });

  const balances = useMemo(() => {
    if (!data || data.length === 0 || data[0].status !== 'success') {
      return [];
    }

    return data[0].result.map((balance, i) => ({
      tokenId: tokenIds[i],
      balance: Number(balance) / 1e6,
    }));
  }, [data, tokenIds]);

  return { balances, isLoading, error, refetch };
}
