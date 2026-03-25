import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAccount } from 'wagmi';

import { useOnChainPositions } from '../hooks/useOnChainPositions';
import { useTrading } from '../hooks/useTrading';
import { useTradingApprovals } from '../hooks/useApprovals';
import { TransactionModal, TX_STATUS } from './TransactionModal';
import { PortfolioCharts } from './PortfolioCharts';
import { CONFIG, bandTokenIds } from '../lib/config';
import { POLYGON_CONTRACTS } from '../lib/contracts';

export function Positions({ positions: mockPositions, breakdown, isConnected, bands }) {
  const { address } = useAccount();
  const isMockMode = CONFIG.mode === 'mock';

  // Get token IDs from bands or config
  const tokenIds = useMemo(() => {
    if (!bands) return bandTokenIds;
    return bands.map(b => b.tokenId).filter(Boolean);
  }, [bands]);

  // On-chain positions (only used in mainnet mode)
  const {
    positions: onChainPositions,
    hasPositions: hasOnChainPositions,
    isLoading: isLoadingPositions,
    refetch: refetchPositions,
  } = useOnChainPositions(tokenIds, bands);

  // Trading hook for selling
  const {
    isAuthenticated,
    authenticate,
    sellYesTokens,
    isPending: isSellPending,
    error: sellError,
    clearError,
    isOnPolygon,
  } = useTrading();

  // Approvals for selling
  const {
    ctfApproval,
    approveCtf,
    refetchAll: refetchApprovals,
  } = useTradingApprovals();

  // Sell modal state
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellModalStatus, setSellModalStatus] = useState(TX_STATUS.IDLE);
  const [sellModalError, setSellModalError] = useState(null);
  const [sellBandIndex, setSellBandIndex] = useState(null);
  const [sellAmount, setSellAmount] = useState('');

  // Track sell amounts per band
  const [bandSellAmounts, setBandSellAmounts] = useState({});

  // Check if CTF is approved for selling
  const needsCtfApproval = useMemo(() => {
    if (isMockMode) return false;
    return !ctfApproval.exchange.isApproved && !ctfApproval.negRisk.isApproved;
  }, [isMockMode, ctfApproval]);

  // Get band positions with balances
  const bandPositions = useMemo(() => {
    if (isMockMode || !onChainPositions?.bandBalances) return [];
    return onChainPositions.bandBalances.filter(b => b.balance > 0);
  }, [isMockMode, onChainPositions]);

  const hasPositions = isMockMode
    ? (mockPositions?.long > 0 || mockPositions?.short > 0)
    : hasOnChainPositions;

  // Calculate total portfolio value (must be before early returns for hooks order)
  const totalValue = useMemo(() => {
    return bandPositions.reduce((sum, band) => {
      const bandData = bands?.find(b => b.tokenId === band.tokenId);
      const price = bandData?.price || 0;
      return sum + (band.balance * price);
    }, 0);
  }, [bandPositions, bands]);

  const totalTokens = useMemo(() => {
    return bandPositions.reduce((sum, band) => sum + band.balance, 0);
  }, [bandPositions]);

  // Load/save cost basis from localStorage (must be before early returns for hooks order)
  const costBasisKey = address ? `vaulto_cost_basis_${address}` : null;
  const [costBasis, setCostBasis] = useState(null);

  // Load cost basis on mount
  useEffect(() => {
    if (costBasisKey) {
      try {
        const stored = localStorage.getItem(costBasisKey);
        if (stored) {
          setCostBasis(parseFloat(stored));
        }
      } catch (e) {
        console.error('Failed to load cost basis:', e);
      }
    }
  }, [costBasisKey]);

  // If we have positions but no cost basis, set it to current value (first time)
  useEffect(() => {
    if (hasPositions && totalValue > 0 && costBasis === null && costBasisKey) {
      setCostBasis(totalValue);
      try {
        localStorage.setItem(costBasisKey, totalValue.toString());
      } catch (e) {
        console.error('Failed to save cost basis:', e);
      }
    }
  }, [hasPositions, totalValue, costBasis, costBasisKey]);

  if (!isConnected) {
    return (
      <section className="positions-section">
        <h3 className="section-title">Your Positions</h3>
        <div className="positions-empty">Connect wallet to view your positions</div>
      </section>
    );
  }

  if (isLoadingPositions && !isMockMode) {
    return (
      <section className="positions-section">
        <h3 className="section-title">Your Positions</h3>
        <div className="positions-empty">Loading positions...</div>
      </section>
    );
  }

  if (!hasPositions) {
    return (
      <section className="positions-section">
        <h3 className="section-title">Your Positions</h3>
        <div className="positions-empty">
          No positions yet. Buy tokens above to get started.
        </div>
      </section>
    );
  }

  // Handle approve CTF for selling
  const handleApproveCtf = async () => {
    setShowSellModal(true);
    setSellModalStatus(TX_STATUS.AWAITING_SIGNATURE);
    setSellModalError(null);

    try {
      await approveCtf.approveForNegRiskExchange();
      setSellModalStatus(TX_STATUS.SUCCESS);
      refetchApprovals();
    } catch (e) {
      setSellModalError(e);
      setSellModalStatus(TX_STATUS.ERROR);
    }
  };

  // Handle sell click for a specific band
  const handleSellClick = async (bandIndex) => {
    const band = bandPositions[bandIndex];
    const amount = parseFloat(bandSellAmounts[bandIndex] || 0);

    if (!amount || amount <= 0) {
      alert('Please enter an amount to sell');
      return;
    }

    if (amount > band.balance) {
      alert(`Cannot sell more than your balance (${band.balance.toFixed(4)})`);
      return;
    }

    setSellBandIndex(bandIndex);
    setSellAmount(amount);

    if (!isOnPolygon) {
      alert('Please switch to Polygon network');
      return;
    }

    if (!isAuthenticated) {
      try {
        await authenticate();
      } catch (e) {
        return;
      }
    }

    if (needsCtfApproval) {
      await handleApproveCtf();
      return;
    }

    // Show sell confirmation
    setShowSellModal(true);
    setSellModalStatus(TX_STATUS.IDLE);
    setSellModalError(null);
  };

  // Get the current sell order
  const getSellOrder = () => {
    if (sellBandIndex === null || !bandPositions[sellBandIndex]) return [];
    const band = bandPositions[sellBandIndex];
    const bandData = bands?.find(b => b.tokenId === band.tokenId);

    return [{
      tokenId: band.tokenId,
      label: band.label,
      price: bandData?.price || 0,
      size: sellAmount,
      bandIndex: sellBandIndex,
      tickSize: CONFIG.trading?.tickSize || '0.01',
      negRisk: bandData?.negRisk ?? CONFIG.trading?.negRisk ?? true,
    }];
  };

  // Handle confirm sell
  const handleConfirmSell = async () => {
    setSellModalStatus(TX_STATUS.PENDING);
    setSellModalError(null);

    try {
      const orders = getSellOrder();
      const result = await sellYesTokens(orders);

      if (result) {
        setSellModalStatus(TX_STATUS.SUCCESS);
        refetchPositions();
        // Clear the sell amount for this band
        setBandSellAmounts(prev => ({ ...prev, [sellBandIndex]: '' }));
      } else {
        setSellModalError(sellError || new Error('Sell order failed'));
        setSellModalStatus(TX_STATUS.ERROR);
      }
    } catch (e) {
      setSellModalError(e);
      setSellModalStatus(TX_STATUS.ERROR);
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    setShowSellModal(false);
    setSellModalStatus(TX_STATUS.IDLE);
    setSellModalError(null);
    setSellBandIndex(null);
    clearError();
  };

  // Handle sell all for a band
  const handleSellAll = (bandIndex) => {
    const band = bandPositions[bandIndex];
    setBandSellAmounts(prev => ({ ...prev, [bandIndex]: band.balance.toString() }));
  };

  // Mock mode display
  if (isMockMode) {
    return (
      <section className="positions-section">
        <h3 className="section-title">Your Positions (Mock Mode)</h3>
        <div className="positions-empty">
          Mock mode - positions stored locally
        </div>
      </section>
    );
  }

  return (
    <section className="positions-section">
      <h3 className="section-title">
        Your Band Positions
        <button className="refresh-btn" onClick={refetchPositions} title="Refresh positions">
          ↻
        </button>
      </h3>

      {/* Portfolio Summary */}
      {bandPositions.length > 0 && (
        <div className="portfolio-summary">
          <div className="summary-row">
            <span className="summary-label">Total Tokens:</span>
            <span className="summary-value">{totalTokens.toFixed(4)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Total Market Value:</span>
            <span className="summary-value summary-highlight">${totalValue.toFixed(2)}</span>
          </div>
          {costBasis && (
            <div className="summary-row">
              <span className="summary-label">Cost Basis:</span>
              <span className="summary-value">
                ${costBasis.toFixed(2)}
                <button
                  className="reset-cost-btn"
                  onClick={() => {
                    setCostBasis(totalValue);
                    localStorage.setItem(costBasisKey, totalValue.toString());
                  }}
                  title="Reset cost basis to current value"
                >
                  ↺
                </button>
              </span>
            </div>
          )}
          {costBasis && totalValue !== costBasis && (
            <div className="summary-row">
              <span className="summary-label">P&L:</span>
              <span className={`summary-value ${totalValue >= costBasis ? 'pnl-up' : 'pnl-down'}`}>
                {totalValue >= costBasis ? '+' : ''}{((totalValue - costBasis) / costBasis * 100).toFixed(1)}%
                ({totalValue >= costBasis ? '+' : ''}${(totalValue - costBasis).toFixed(2)})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Portfolio Charts */}
      <PortfolioCharts
        bands={bands}
        totalValue={totalValue}
        costBasis={costBasis}
        address={address}
        hasPositions={hasPositions && bandPositions.length > 0}
        bandBalances={bandPositions}
      />

      <div className="band-positions">
        {bandPositions.map((band, index) => {
          const bandData = bands?.find(b => b.tokenId === band.tokenId);
          const currentPrice = bandData?.price || 0;
          const currentValue = band.balance * currentPrice;
          const sellAmountInput = bandSellAmounts[index] || '';

          return (
            <div key={band.tokenId} className="band-position-card">
              <div className="band-header">
                <span className="band-name">{band.label}</span>
                <span className="band-price">${(currentPrice * 100).toFixed(1)}¢</span>
              </div>

              <div className="band-details">
                <div className="band-row">
                  <span>Balance:</span>
                  <span className="band-value">{band.balance.toFixed(4)} tokens</span>
                </div>
                <div className="band-row">
                  <span>Value:</span>
                  <span className="band-value">${currentValue.toFixed(2)}</span>
                </div>
              </div>

              <div className="sell-controls">
                <div className="sell-input-row">
                  <input
                    type="number"
                    className="sell-input"
                    placeholder="Amount to sell"
                    value={sellAmountInput}
                    min="0"
                    max={band.balance}
                    step="0.01"
                    onChange={(e) => setBandSellAmounts(prev => ({
                      ...prev,
                      [index]: e.target.value
                    }))}
                  />
                  <button
                    className="sell-max-btn"
                    onClick={() => handleSellAll(index)}
                  >
                    MAX
                  </button>
                </div>
                <button
                  className="sell-btn"
                  onClick={() => handleSellClick(index)}
                  disabled={isSellPending || !sellAmountInput || parseFloat(sellAmountInput) <= 0}
                >
                  {isSellPending && sellBandIndex === index ? 'SELLING...' : 'SELL'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {bandPositions.length === 0 && (
        <div className="positions-empty">
          No band positions found. Your tokens may still be processing.
        </div>
      )}

      {/* Sell Modal */}
      <TransactionModal
        isOpen={showSellModal}
        onClose={handleModalClose}
        onConfirm={
          sellModalStatus === TX_STATUS.IDLE || sellModalStatus === TX_STATUS.ERROR
            ? handleConfirmSell
            : undefined
        }
        status={sellModalStatus}
        type={needsCtfApproval ? 'approve' : 'sell'}
        orders={getSellOrder()}
        totalCost={sellAmount * (bands?.find(b => b.tokenId === bandPositions[sellBandIndex]?.tokenId)?.price || 0)}
        error={sellModalError}
      />

      <style>{`
        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .refresh-btn {
          background: none;
          border: none;
          color: var(--text-secondary, #888);
          cursor: pointer;
          font-size: 16px;
          padding: 4px;
          border-radius: 4px;
        }

        .refresh-btn:hover {
          background: var(--bg-muted, rgba(255,255,255,0.05));
          color: var(--text, #fff);
        }

        .band-positions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .band-position-card {
          background: var(--bg-surface, #1a1a2e);
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 12px;
          padding: 16px;
        }

        .band-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .band-name {
          font-weight: 600;
          font-size: 15px;
        }

        .band-price {
          font-family: var(--mono, 'DM Mono', monospace);
          color: var(--text-secondary, #888);
          font-size: 13px;
        }

        .band-details {
          margin-bottom: 12px;
        }

        .band-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          padding: 4px 0;
          color: var(--text-secondary, #888);
        }

        .band-value {
          font-family: var(--mono, 'DM Mono', monospace);
          color: var(--text, #fff);
          font-weight: 500;
        }

        .sell-controls {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sell-input-row {
          display: flex;
          gap: 8px;
        }

        .sell-input {
          flex: 1;
          padding: 10px 12px;
          background: var(--bg-muted, rgba(255,255,255,0.05));
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 8px;
          color: var(--text, #fff);
          font-size: 14px;
          font-family: var(--mono, 'DM Mono', monospace);
        }

        .sell-input:focus {
          outline: none;
          border-color: var(--blue, #2952CC);
        }

        .sell-max-btn {
          padding: 10px 12px;
          background: var(--bg-muted, rgba(255,255,255,0.1));
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 8px;
          color: var(--text-secondary, #888);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .sell-max-btn:hover {
          background: var(--bg-muted, rgba(255,255,255,0.15));
          color: var(--text, #fff);
        }

        .sell-btn {
          padding: 12px;
          background: var(--red, #C4342D);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: opacity 0.15s;
        }

        .sell-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .sell-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .positions-empty {
          padding: 24px;
          text-align: center;
          color: var(--text-secondary, #888);
          background: var(--bg-muted, rgba(255,255,255,0.03));
          border-radius: 10px;
        }

        .portfolio-summary {
          background: linear-gradient(135deg, var(--blue-mid, rgba(41,82,204,0.15)), var(--bg-surface, #1a1a2e));
          border: 1px solid var(--blue, #2952CC);
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 16px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
        }

        .summary-label {
          color: var(--text-secondary, #888);
          font-size: 14px;
        }

        .summary-value {
          font-family: var(--mono, 'DM Mono', monospace);
          font-weight: 600;
          font-size: 14px;
        }

        .summary-highlight {
          font-size: 20px;
          color: var(--blue, #2952CC);
        }

        .reset-cost-btn {
          background: none;
          border: none;
          color: var(--text-secondary, #888);
          cursor: pointer;
          font-size: 14px;
          margin-left: 8px;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .reset-cost-btn:hover {
          background: var(--bg-muted, rgba(255,255,255,0.1));
          color: var(--text, #fff);
        }

        .pnl-up {
          color: var(--green, #1A7D46);
        }

        .pnl-down {
          color: var(--red, #C4342D);
        }
      `}</style>
    </section>
  );
}
