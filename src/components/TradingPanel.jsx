import { useState, useCallback, useMemo, useEffect } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';

import { useTrading } from '../hooks/useTrading';
import { useTradingApprovals } from '../hooks/useApprovals';
import { TransactionModal, TX_STATUS } from './TransactionModal';
import { CONFIG } from '../lib/config';
import { CHAIN_IDS, POLYGON_CONTRACTS } from '../lib/contracts';
import { calcLongWeight, calcShortWeight } from '../lib/pricing';

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[TradingPanel]', ...args);

export function TradingPanel({
  selectedPosition,
  setSelectedPosition,
  amount,
  setAmount,
  breakdown,
  bands,
  isConnected,
  onBuy,
  loading,
}) {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Trading hook
  const {
    isAuthenticated,
    isAuthenticating,
    authenticate,
    authError,
    buyYesTokens,
    isPending: isTradePending,
    pendingTx,
    error: tradeError,
    clearError,
    isOnPolygon,
  } = useTrading();

  // Approvals hook
  const {
    usdcBalance,
    usdcAllowance,
    approveUsdc,
    refetchAll: refetchApprovals,
  } = useTradingApprovals();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState(TX_STATUS.IDLE);
  const [modalError, setModalError] = useState(null);

  const isLong = selectedPosition === 'long';
  const isMockMode = CONFIG.mode === 'mock';

  const cost = breakdown
    ? isLong
      ? breakdown.longCost
      : breakdown.shortCost
    : 0;
  const totalCost = cost * amount;

  const bestReturn = breakdown
    ? isLong
      ? breakdown.bestLongReturn
      : breakdown.bestShortReturn
    : 0;
  const worstReturn = breakdown
    ? isLong
      ? breakdown.worstLongReturn
      : breakdown.worstShortReturn
    : 0;
  const floor = breakdown ? (isLong ? breakdown.floorL : breakdown.floorS) : 0;

  // Check if user has sufficient balance
  const hasSufficientBalance = usdcBalance.balanceFormatted >= totalCost;

  // Check if user has sufficient allowance (for neg risk exchange)
  const needsApproval = useMemo(() => {
    if (isMockMode) return false;
    const allowance = usdcAllowance.negRisk.allowanceFormatted;
    return allowance < totalCost;
  }, [isMockMode, usdcAllowance.negRisk.allowanceFormatted, totalCost]);

  // Log state on mount and changes
  useEffect(() => {
    log('TradingPanel state:', {
      isMockMode,
      isConnected,
      isOnPolygon,
      chainId,
      isAuthenticated,
      selectedPosition,
      amount,
      bandsCount: bands?.length,
      hasBandTokenIds: bands?.some(b => b.tokenId),
      usdcBalance: usdcBalance.balanceFormatted,
      nativeUsdcBalance: usdcBalance.nativeBalanceFormatted,
      needsApproval,
      hasSufficientBalance,
    });
  }, [isMockMode, isConnected, isOnPolygon, chainId, isAuthenticated, selectedPosition, amount, bands, usdcBalance.balanceFormatted, usdcBalance.nativeBalanceFormatted, needsApproval, hasSufficientBalance]);

  // Calculate orders for each band based on weights
  const orders = useMemo(() => {
    if (!bands || bands.length === 0) return [];

    const numBands = bands.length;
    const floorL = CONFIG.floorL;
    const floorS = CONFIG.floorS;

    return bands.map((band, i) => {
      const weight = isLong
        ? calcLongWeight(i, numBands, floorL)
        : calcShortWeight(i, numBands, floorS);

      // Size is weight * amount (weighted distribution across bands)
      const size = weight * amount;

      return {
        tokenId: band.tokenId,
        label: band.label,
        price: band.price,
        size,
        weight,
        bandIndex: i,
        tickSize: CONFIG.trading?.tickSize || '0.01',
        negRisk: band.negRisk ?? CONFIG.trading?.negRisk ?? true,
        positionType: selectedPosition,
      };
    }).filter(order => order.tokenId && order.size > 0);
  }, [bands, amount, isLong, selectedPosition]);

  // Handle switch to Polygon
  const handleSwitchNetwork = useCallback(async () => {
    try {
      await switchChain({ chainId: CHAIN_IDS.POLYGON });
    } catch (e) {
      console.error('Failed to switch network:', e);
    }
  }, [switchChain]);

  // Track approval transaction state
  useEffect(() => {
    log('Approval state changed:', {
      isPending: approveUsdc.isPending,
      isSuccess: approveUsdc.isSuccess,
      hash: approveUsdc.hash,
      error: approveUsdc.error?.message,
    });

    if (approveUsdc.isSuccess && showModal && modalStatus === TX_STATUS.CONFIRMING) {
      log('Approval transaction confirmed!');
      setModalStatus(TX_STATUS.SUCCESS);
      refetchApprovals();
    }
    if (approveUsdc.error && showModal && modalStatus === TX_STATUS.CONFIRMING) {
      log('Approval transaction failed:', approveUsdc.error);
      setModalError(approveUsdc.error);
      setModalStatus(TX_STATUS.ERROR);
    }
  }, [approveUsdc.isPending, approveUsdc.isSuccess, approveUsdc.hash, approveUsdc.error, showModal, modalStatus, refetchApprovals]);

  // Handle approve USDC
  const handleApprove = useCallback(async () => {
    log('handleApprove called');
    setShowModal(true);
    setModalStatus(TX_STATUS.AWAITING_SIGNATURE);
    setModalError(null);

    try {
      log('Calling approveForNegRiskExchange...');
      await approveUsdc.approveForNegRiskExchange();
      // After signature, wait for confirmation via the useEffect above
      log('Signature obtained, waiting for confirmation...');
      setModalStatus(TX_STATUS.CONFIRMING);
    } catch (e) {
      log('Approval error:', e);
      setModalError(e);
      setModalStatus(TX_STATUS.ERROR);
    }
  }, [approveUsdc]);

  // Handle authenticate
  const handleAuthenticate = useCallback(async () => {
    setShowModal(true);
    setModalStatus(TX_STATUS.AWAITING_SIGNATURE);
    setModalError(null);

    try {
      const success = await authenticate();
      if (success) {
        setShowModal(false);
        setModalStatus(TX_STATUS.IDLE);
      } else {
        setModalError(authError || new Error('Authentication failed'));
        setModalStatus(TX_STATUS.ERROR);
      }
    } catch (e) {
      setModalError(e);
      setModalStatus(TX_STATUS.ERROR);
    }
  }, [authenticate, authError]);

  // Handle buy click
  const handleBuyClick = useCallback(async () => {
    log('handleBuyClick called:', {
      isMockMode,
      isOnPolygon,
      isAuthenticated,
      needsApproval,
      ordersCount: orders.length,
    });

    // In mock mode, use the original onBuy callback
    if (isMockMode) {
      log('Mock mode - calling onBuy');
      onBuy();
      return;
    }

    // Check network
    if (!isOnPolygon) {
      log('Not on Polygon - switching network');
      handleSwitchNetwork();
      return;
    }

    // Check authentication
    if (!isAuthenticated) {
      log('Not authenticated - starting authentication');
      await handleAuthenticate();
      return;
    }

    // Check approval
    if (needsApproval) {
      log('Needs approval - starting approval');
      await handleApprove();
      return;
    }

    // Show confirmation modal
    log('All checks passed - showing confirmation modal');
    log('Orders to submit:', orders);
    setShowModal(true);
    setModalStatus(TX_STATUS.IDLE);
    setModalError(null);
  }, [isMockMode, onBuy, isOnPolygon, handleSwitchNetwork, isAuthenticated, handleAuthenticate, needsApproval, handleApprove, orders]);

  // Handle confirm order
  const handleConfirmOrder = useCallback(async () => {
    log('handleConfirmOrder called');
    log('Orders to execute:', orders);

    setModalStatus(TX_STATUS.PENDING);
    setModalError(null);

    try {
      log('Calling buyYesTokens...');
      const result = await buyYesTokens(orders);
      log('buyYesTokens result:', result);

      if (result) {
        log('Order successful');
        setModalStatus(TX_STATUS.SUCCESS);
        // Refresh approvals and balances
        refetchApprovals();
      } else {
        const err = tradeError || new Error('Order failed - no result returned');
        log('Order failed:', err);
        setModalError(err);
        setModalStatus(TX_STATUS.ERROR);
      }
    } catch (e) {
      log('Order error:', e);
      setModalError(e);
      setModalStatus(TX_STATUS.ERROR);
    }
  }, [buyYesTokens, orders, tradeError, refetchApprovals]);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setShowModal(false);
    setModalStatus(TX_STATUS.IDLE);
    setModalError(null);
    clearError();
  }, [clearError]);

  // Determine button state and text
  const getButtonState = () => {
    if (!isConnected) {
      return { disabled: true, text: 'CONNECT WALLET' };
    }

    if (isMockMode) {
      return {
        disabled: amount <= 0 || loading,
        text: `BUY ${isLong ? 'LONG' : 'SHORT'} (MOCK)`,
      };
    }

    if (!isOnPolygon) {
      return { disabled: false, text: 'SWITCH TO POLYGON' };
    }

    if (isAuthenticating) {
      return { disabled: true, text: 'AUTHENTICATING...' };
    }

    if (!isAuthenticated) {
      return { disabled: false, text: 'SIGN TO TRADE' };
    }

    if (needsApproval) {
      return { disabled: false, text: 'APPROVE USDC' };
    }

    if (!hasSufficientBalance) {
      return { disabled: true, text: 'INSUFFICIENT USDC' };
    }

    if (isTradePending) {
      return { disabled: true, text: 'PROCESSING...' };
    }

    return {
      disabled: amount <= 0 || loading || orders.length === 0,
      text: `BUY ${isLong ? 'LONG' : 'SHORT'} POSITION`,
    };
  };

  const buttonState = getButtonState();

  return (
    <>
      {/* Position Tabs */}
      <div className="position-tabs">
        <button
          className={`position-tab ${selectedPosition === 'long' ? 'active' : ''}`}
          data-position="long"
          onClick={() => setSelectedPosition('long')}
        >
          LONG
        </button>
        <button
          className={`position-tab ${selectedPosition === 'short' ? 'active' : ''}`}
          data-position="short"
          onClick={() => setSelectedPosition('short')}
        >
          SHORT
        </button>
      </div>

      {/* Trading Panel */}
      <div className="trading-panel">
        {/* Network warning */}
        {isConnected && !isMockMode && !isOnPolygon && (
          <div className="network-warning">
            Please switch to Polygon network to trade
          </div>
        )}

        {/* Balance & Approval Status */}
        {isConnected && !isMockMode && isOnPolygon && (
          <div className="status-panel">
            <div className="status-row">
              <span className="status-label">USDC.e Balance:</span>
              <span className={`status-value ${usdcBalance.balanceFormatted > 0 ? 'status-ok' : 'status-error'}`}>
                ${usdcBalance.balanceFormatted.toFixed(2)}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">USDC.e Allowance:</span>
              <span className={`status-value ${usdcAllowance.negRisk.allowanceFormatted > 0 ? 'status-ok' : 'status-error'}`}>
                {usdcAllowance.negRisk.allowanceFormatted > 1000000
                  ? 'Unlimited'
                  : `$${usdcAllowance.negRisk.allowanceFormatted.toFixed(2)}`}
              </span>
            </div>
            {/* Always show approve button if allowance is 0 or less than total cost */}
            {(usdcAllowance.negRisk.allowanceFormatted < totalCost) && (
              <button
                className="approve-btn"
                onClick={handleApprove}
                disabled={approveUsdc.isPending}
              >
                {approveUsdc.isPending ? 'APPROVING...' : 'APPROVE USDC FOR TRADING'}
              </button>
            )}
            {approveUsdc.hash && (
              <div className="tx-status">
                TX: <a href={`https://polygonscan.com/tx/${approveUsdc.hash}`} target="_blank" rel="noopener noreferrer">
                  {approveUsdc.hash.slice(0, 10)}...
                </a>
                {approveUsdc.isSuccess ? ' ✓ Confirmed' : ' Pending...'}
              </div>
            )}
            {/* Warning if user has native USDC but not USDC.e */}
            {usdcBalance.nativeBalanceFormatted > 0 && usdcBalance.balanceFormatted === 0 && (
              <div className="usdc-warning">
                You have ${usdcBalance.nativeBalanceFormatted.toFixed(2)} native USDC, but Polymarket requires <strong>USDC.e</strong> (bridged USDC).
                Please swap on <a href="https://app.uniswap.org" target="_blank" rel="noopener noreferrer">Uniswap</a> or use the Polygon bridge.
              </div>
            )}
          </div>
        )}

        {/* Amount Input */}
        <div className="input-group">
          <label className="input-label" htmlFor="amountInput">
            Amount (tokens)
          </label>
          <input
            type="number"
            id="amountInput"
            className="amount-input"
            placeholder="Enter amount"
            value={amount}
            min="0"
            step="0.1"
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* Cost Breakdown */}
        <div className="cost-breakdown">
          <div className="cost-row">
            <span className="cost-label">Cost per token</span>
            <span className="cost-value">${cost.toFixed(4)}</span>
          </div>
          <div className="cost-row">
            <span className="cost-label">Total cost</span>
            <span className="cost-value large">${totalCost.toFixed(2)}</span>
          </div>
        </div>

        {/* Payoff Info */}
        <div className="payoff-info">
          <div className="payoff-item">
            {isLong ? (
              <>
                Payoff at $2.0T+: <strong>$1.00</strong> (max)
              </>
            ) : (
              <>
                Payoff at No IPO: <strong>$1.00</strong> (max)
              </>
            )}
          </div>
          <div className="payoff-item">
            {isLong ? (
              <>
                Payoff at No IPO: <strong>${floor.toFixed(2)}</strong> (floor)
              </>
            ) : (
              <>
                Payoff at $2.0T+: <strong>${floor.toFixed(2)}</strong> (floor)
              </>
            )}
          </div>
        </div>

        {/* Return Display */}
        <div className="return-row">
          <div className="return-item">
            <div className="return-label">Best case</div>
            <div className="return-value positive">+{bestReturn.toFixed(1)}%</div>
          </div>
          <div className="return-item">
            <div className="return-label">Worst case</div>
            <div
              className={`return-value ${worstReturn >= 0 ? 'positive' : 'negative'}`}
            >
              {worstReturn >= 0 ? '+' : ''}
              {worstReturn.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Buy Button */}
        <button
          className={`buy-button ${isLong ? 'btn-long' : 'btn-short'}`}
          onClick={handleBuyClick}
          disabled={buttonState.disabled}
        >
          {buttonState.text}
        </button>

        {/* Mode indicator */}
        {isMockMode && (
          <div className="mode-indicator">
            Mock mode - No real transactions
          </div>
        )}
      </div>

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={showModal}
        onClose={handleModalClose}
        onConfirm={
          modalStatus === TX_STATUS.IDLE
            ? handleConfirmOrder
            : modalStatus === TX_STATUS.ERROR
            ? handleConfirmOrder
            : undefined
        }
        status={modalStatus}
        type={needsApproval ? 'approve' : 'buy'}
        orders={orders}
        totalCost={totalCost}
        error={modalError}
        txHash={approveUsdc.hash}
      />

      <style>{`
        .network-warning {
          background: var(--red-mid, rgba(196,52,45,0.2));
          color: var(--red, #C4342D);
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
          text-align: center;
        }

        .status-panel {
          background: var(--bg-muted, rgba(255,255,255,0.05));
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
        }

        .status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
        }

        .status-label {
          color: var(--text-secondary, #888);
          font-size: 13px;
        }

        .status-value {
          font-weight: 600;
          font-family: var(--mono, 'DM Mono', monospace);
          font-size: 13px;
        }

        .status-ok {
          color: var(--green, #1A7D46);
        }

        .status-error {
          color: var(--red, #C4342D);
        }

        .approve-btn {
          width: 100%;
          margin-top: 12px;
          padding: 12px;
          background: var(--yellow, #FFC107);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        }

        .approve-btn:hover {
          opacity: 0.9;
        }

        .approve-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .tx-status {
          margin-top: 8px;
          font-size: 12px;
          color: var(--text-secondary, #888);
        }

        .tx-status a {
          color: var(--blue, #2952CC);
        }

        .balance-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-muted, rgba(255,255,255,0.05));
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .balance-label {
          color: var(--text-secondary, #888);
        }

        .balance-value {
          font-weight: 600;
          font-family: var(--mono, 'DM Mono', monospace);
        }

        .mode-indicator {
          text-align: center;
          font-size: 11px;
          color: var(--text-tertiary, #666);
          margin-top: 12px;
          padding: 8px;
          background: var(--bg-muted, rgba(255,255,255,0.03));
          border-radius: 6px;
        }

        .usdc-warning {
          background: var(--yellow-mid, rgba(255,193,7,0.15));
          color: var(--yellow, #FFC107);
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 12px;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        .usdc-warning a {
          color: inherit;
          text-decoration: underline;
        }
      `}</style>
    </>
  );
}
