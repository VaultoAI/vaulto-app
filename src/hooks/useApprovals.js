/**
 * Hooks for managing ERC-20 and ERC-1155 approvals
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { parseUnits, maxUint256 } from 'viem';

import { POLYGON_CONTRACTS, USDC_DECIMALS, CHAIN_IDS } from '../lib/contracts';
import { ERC20_ABI } from '../lib/abis/erc20';
import { ERC1155_ABI } from '../lib/abis/erc1155';

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[useApprovals]', ...args);
const logError = (...args) => console.error('[useApprovals]', ...args);

/**
 * Hook to check USDC balance
 * Checks both USDC.e (bridged) and native USDC
 */
export function useUsdcBalance() {
  const { address } = useAccount();
  const chainId = useChainId();

  log('useUsdcBalance init:', {
    address,
    chainId,
    expectedChainId: CHAIN_IDS.POLYGON,
    usdcE: POLYGON_CONTRACTS.USDC_E,
    usdcNative: POLYGON_CONTRACTS.USDC_NATIVE,
  });

  // Check USDC.e (bridged) - this is what Polymarket uses
  const { data: balanceE, refetch: refetchE, isLoading: isLoadingE, error: errorE, status: statusE } = useReadContract({
    address: POLYGON_CONTRACTS.USDC_E,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_IDS.POLYGON,
    query: {
      enabled: !!address,
    },
  });

  // Also check native USDC for diagnostic purposes
  const { data: balanceNative, isLoading: isLoadingNative, error: errorNative } = useReadContract({
    address: POLYGON_CONTRACTS.USDC_NATIVE,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_IDS.POLYGON,
    query: {
      enabled: !!address,
    },
  });

  // Log when data changes
  useEffect(() => {
    const balanceEFormatted = balanceE ? Number(balanceE) / 10 ** USDC_DECIMALS : 0;
    const balanceNativeFormatted = balanceNative ? Number(balanceNative) / 10 ** USDC_DECIMALS : 0;

    log('USDC Balance check:', {
      address,
      status: statusE,
      chainId,
      isPolygon: chainId === CHAIN_IDS.POLYGON,
      'USDC.e (bridged - Polymarket uses this)': {
        raw: balanceE?.toString(),
        formatted: balanceEFormatted,
        contract: POLYGON_CONTRACTS.USDC_E,
        error: errorE?.message,
      },
      'Native USDC (NOT used by Polymarket)': {
        raw: balanceNative?.toString(),
        formatted: balanceNativeFormatted,
        contract: POLYGON_CONTRACTS.USDC_NATIVE,
        error: errorNative?.message,
      },
    });

    // Warn if user has native but not bridged
    if (balanceNativeFormatted > 0 && balanceEFormatted === 0) {
      console.warn('[useApprovals] WARNING: You have Native USDC but Polymarket requires USDC.e (bridged USDC). You need to swap Native USDC to USDC.e on a DEX like Uniswap or use the Polygon Bridge.');
    }

    if (errorE) {
      logError('USDC.e balance query error:', errorE);
    }
  }, [balanceE, balanceNative, errorE, errorNative, statusE, chainId, address]);

  // Convert from 6 decimals to human readable
  const balanceFormatted = balanceE
    ? Number(balanceE) / 10 ** USDC_DECIMALS
    : 0;

  const nativeBalanceFormatted = balanceNative
    ? Number(balanceNative) / 10 ** USDC_DECIMALS
    : 0;

  return {
    balance: balanceE || 0n,
    balanceFormatted,
    nativeBalance: balanceNative || 0n,
    nativeBalanceFormatted,
    refetch: refetchE,
    isLoading: isLoadingE || isLoadingNative,
    error: errorE,
  };
}

/**
 * Hook to check USDC allowance for a spender
 */
export function useUsdcAllowance(spender) {
  const { address } = useAccount();
  const chainId = useChainId();

  log('useUsdcAllowance init:', {
    address,
    spender,
    chainId,
    usdcContract: POLYGON_CONTRACTS.USDC_E,
  });

  const { data: allowance, refetch, isLoading, error, status } = useReadContract({
    address: POLYGON_CONTRACTS.USDC_E,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && spender ? [address, spender] : undefined,
    chainId: CHAIN_IDS.POLYGON, // Force Polygon chain
    query: {
      enabled: !!address && !!spender,
    },
  });

  useEffect(() => {
    log('USDC Allowance result:', {
      spender,
      allowance: allowance?.toString(),
      status,
      error: error?.message,
    });
  }, [allowance, spender, status, error]);

  const allowanceFormatted = allowance
    ? Number(allowance) / 10 ** USDC_DECIMALS
    : 0;

  return {
    allowance: allowance || 0n,
    allowanceFormatted,
    refetch,
    isLoading,
    error,
  };
}

/**
 * Hook to approve USDC spending
 */
export function useApproveUsdc() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const chainId = useChainId();

  const { writeContract, data: hash, isPending: isWritePending, error: writeError, status: writeStatus } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, status: receiptStatus } = useWaitForTransactionReceipt({
    hash,
  });

  // Log transaction state changes
  useEffect(() => {
    log('Approve USDC state:', {
      hash,
      writeStatus,
      isWritePending,
      isConfirming,
      isSuccess,
      receiptStatus,
      writeError: writeError?.message,
      chainId,
    });
  }, [hash, writeStatus, isWritePending, isConfirming, isSuccess, receiptStatus, writeError, chainId]);

  // Approve USDC for a spender
  const approve = useCallback(async (spender, amount) => {
    log('Approving USDC:', {
      spender,
      amount,
      usdcContract: POLYGON_CONTRACTS.USDC_E,
      chainId,
    });

    setError(null);
    setIsPending(true);

    try {
      // Convert amount to USDC decimals (6)
      const amountInUnits = amount === 'max'
        ? maxUint256
        : parseUnits(String(amount), USDC_DECIMALS);

      log('Calling writeContract for approve:', {
        address: POLYGON_CONTRACTS.USDC_E,
        functionName: 'approve',
        args: [spender, amountInUnits.toString()],
      });

      const result = await writeContract({
        address: POLYGON_CONTRACTS.USDC_E,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amountInUnits],
      });

      log('writeContract result:', result);
    } catch (e) {
      logError('Approve failed:', e);
      setError(e);
      setIsPending(false);
    }
  }, [writeContract, chainId]);

  // Convenience method to approve for CTF Exchange
  const approveForExchange = useCallback(async (amount = 'max') => {
    return approve(POLYGON_CONTRACTS.CTF_EXCHANGE, amount);
  }, [approve]);

  // Convenience method to approve for Neg Risk Adapter (required for neg-risk markets)
  const approveForNegRiskExchange = useCallback(async (amount = 'max') => {
    log('Approving USDC for NEG_RISK_ADAPTER:', POLYGON_CONTRACTS.NEG_RISK_ADAPTER);
    return approve(POLYGON_CONTRACTS.NEG_RISK_ADAPTER, amount);
  }, [approve]);

  // Update pending state when transaction is confirmed
  useEffect(() => {
    if (isSuccess || writeError) {
      setIsPending(false);
    }
  }, [isSuccess, writeError]);

  return {
    approve,
    approveForExchange,
    approveForNegRiskExchange,
    hash,
    isPending: isPending || isWritePending || isConfirming,
    isSuccess,
    error: error || writeError,
  };
}

/**
 * Hook to check ERC-1155 approval status
 */
export function useCtfApproval(operator) {
  const { address } = useAccount();

  log('useCtfApproval init:', {
    address,
    operator,
    ctfContract: POLYGON_CONTRACTS.CONDITIONAL_TOKENS,
  });

  const { data: isApproved, refetch, isLoading, error, status } = useReadContract({
    address: POLYGON_CONTRACTS.CONDITIONAL_TOKENS,
    abi: ERC1155_ABI,
    functionName: 'isApprovedForAll',
    args: address && operator ? [address, operator] : undefined,
    chainId: CHAIN_IDS.POLYGON, // Force Polygon chain
    query: {
      enabled: !!address && !!operator,
    },
  });

  useEffect(() => {
    log('CTF Approval result:', {
      operator,
      isApproved,
      status,
      error: error?.message,
    });
  }, [isApproved, operator, status, error]);

  return {
    isApproved: isApproved || false,
    refetch,
    isLoading,
    error,
  };
}

/**
 * Hook to approve ERC-1155 conditional tokens for selling
 */
export function useApproveCtf() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const { writeContract, data: hash, isPending: isWritePending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const approve = useCallback(async (operator, approved = true) => {
    setError(null);
    setIsPending(true);

    try {
      await writeContract({
        address: POLYGON_CONTRACTS.CONDITIONAL_TOKENS,
        abi: ERC1155_ABI,
        functionName: 'setApprovalForAll',
        args: [operator, approved],
      });
    } catch (e) {
      setError(e);
      setIsPending(false);
    }
  }, [writeContract]);

  // Convenience method to approve for CTF Exchange (selling)
  const approveForExchange = useCallback(async () => {
    return approve(POLYGON_CONTRACTS.CTF_EXCHANGE, true);
  }, [approve]);

  // Convenience method to approve for Neg Risk Exchange
  const approveForNegRiskExchange = useCallback(async () => {
    return approve(POLYGON_CONTRACTS.NEG_RISK_CTF_EXCHANGE, true);
  }, [approve]);

  useEffect(() => {
    if (isSuccess || writeError) {
      setIsPending(false);
    }
  }, [isSuccess, writeError]);

  return {
    approve,
    approveForExchange,
    approveForNegRiskExchange,
    hash,
    isPending: isPending || isWritePending || isConfirming,
    isSuccess,
    error: error || writeError,
  };
}

/**
 * Combined hook for checking all approvals needed for trading
 */
export function useTradingApprovals() {
  const usdcBalance = useUsdcBalance();
  const usdcAllowanceExchange = useUsdcAllowance(POLYGON_CONTRACTS.CTF_EXCHANGE);
  // For neg-risk markets, check allowance on NEG_RISK_ADAPTER (not exchange)
  const usdcAllowanceNegRisk = useUsdcAllowance(POLYGON_CONTRACTS.NEG_RISK_ADAPTER);
  const ctfApprovalExchange = useCtfApproval(POLYGON_CONTRACTS.CTF_EXCHANGE);
  const ctfApprovalNegRisk = useCtfApproval(POLYGON_CONTRACTS.NEG_RISK_CTF_EXCHANGE);
  const approveUsdc = useApproveUsdc();
  const approveCtf = useApproveCtf();

  const refetchAll = useCallback(() => {
    usdcBalance.refetch();
    usdcAllowanceExchange.refetch();
    usdcAllowanceNegRisk.refetch();
    ctfApprovalExchange.refetch();
    ctfApprovalNegRisk.refetch();
  }, [usdcBalance, usdcAllowanceExchange, usdcAllowanceNegRisk, ctfApprovalExchange, ctfApprovalNegRisk]);

  return {
    usdcBalance,
    usdcAllowance: {
      exchange: usdcAllowanceExchange,
      negRisk: usdcAllowanceNegRisk,
    },
    ctfApproval: {
      exchange: ctfApprovalExchange,
      negRisk: ctfApprovalNegRisk,
    },
    approveUsdc,
    approveCtf,
    refetchAll,
  };
}
