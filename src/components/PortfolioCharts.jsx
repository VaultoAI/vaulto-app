import { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';

import { CONFIG, BAND_META } from '../lib/config';
import { fetchHistoricalImpliedValuation, fetchHistoricalPortfolioValue } from '../lib/polymarket';

// Storage key for value history
const HISTORY_KEY = 'vaulto_value_history';
const MAX_HISTORY_POINTS = 100;

/**
 * Calculate implied IPO valuation from band prices
 * Uses probability-weighted average of band midpoints
 */
function calculateImpliedValuation(bands) {
  if (!bands || bands.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  bands.forEach((band, i) => {
    const meta = BAND_META[i];
    if (!meta) return;

    // Price represents probability (0-1)
    const probability = band.price || 0;
    const midpoint = meta.midpoint; // in billions

    // Skip "No IPO" band for valuation calculation
    if (meta.label === 'No IPO') return;

    weightedSum += probability * midpoint;
    totalWeight += probability;
  });

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

/**
 * Load value history from localStorage
 */
function loadHistory(address) {
  try {
    const stored = localStorage.getItem(`${HISTORY_KEY}_${address}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load history:', e);
  }
  return [];
}

/**
 * Save value history to localStorage
 */
function saveHistory(address, history) {
  try {
    // Keep only last N points
    const trimmed = history.slice(-MAX_HISTORY_POINTS);
    localStorage.setItem(`${HISTORY_KEY}_${address}`, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

export function PortfolioCharts({
  bands,
  totalValue,
  costBasis,
  address,
  hasPositions,
  bandBalances = [], // Array of { tokenId, balance, label, index }
}) {
  const [valueHistory, setValueHistory] = useState([]);
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [historicalValuation, setHistoricalValuation] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [portfolioError, setPortfolioError] = useState(null);

  // Refs to track if we've already fetched (prevent duplicate fetches)
  const hasFetchedValuation = useRef(false);
  const hasFetchedPortfolio = useRef(false);

  // Calculate implied IPO valuation
  const impliedValuation = useMemo(() => {
    return calculateImpliedValuation(bands);
  }, [bands]);

  // Load portfolio value history on mount
  useEffect(() => {
    if (address) {
      const history = loadHistory(address);
      setValueHistory(history);
    }
  }, [address]);

  // Fetch historical implied valuation from Polymarket API (once on load)
  useEffect(() => {
    if (!bands || bands.length === 0) return;
    if (hasFetchedValuation.current) return; // Already fetched

    // Check if any band has a valid token ID
    const hasTokenIds = bands.some(b => b.tokenId);
    if (!hasTokenIds) return;

    hasFetchedValuation.current = true; // Mark as fetched

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      setHistoryError(null);

      try {
        // Fetch 1 month of data at 1-hour granularity
        const history = await fetchHistoricalImpliedValuation(bands, '1m', 60);
        setHistoricalValuation(history);
      } catch (e) {
        console.error('Failed to fetch historical valuation:', e);
        setHistoryError(e.message);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [bands]);

  // Fetch 1-day historical portfolio value based on user's token balances (once on load)
  useEffect(() => {
    if (!bandBalances || bandBalances.length === 0) return;
    if (!hasPositions) return;
    if (hasFetchedPortfolio.current) return; // Already fetched

    // Check if any band has a valid token ID and balance
    const hasValidBalances = bandBalances.some(b => b.tokenId && b.balance > 0);
    if (!hasValidBalances) return;

    hasFetchedPortfolio.current = true; // Mark as fetched

    const fetchPortfolioHistory = async () => {
      setIsLoadingPortfolio(true);
      setPortfolioError(null);

      try {
        // Fetch 1 day of data at 5-minute granularity
        const history = await fetchHistoricalPortfolioValue(bandBalances, 5);
        setPortfolioHistory(history);
      } catch (e) {
        console.error('Failed to fetch portfolio history:', e);
        setPortfolioError(e.message);
      } finally {
        setIsLoadingPortfolio(false);
      }
    };

    fetchPortfolioHistory();
  }, [bandBalances, hasPositions]);

  // Record current value periodically
  useEffect(() => {
    if (!address || !hasPositions || totalValue === 0) return;

    const now = Date.now();
    const newPoint = {
      timestamp: now,
      value: totalValue,
      costBasis: costBasis || totalValue,
      impliedValuation,
    };

    setValueHistory(prev => {
      // Don't add if last point was less than 5 minutes ago
      const lastPoint = prev[prev.length - 1];
      if (lastPoint && (now - lastPoint.timestamp) < 5 * 60 * 1000) {
        // Update the last point instead
        const updated = [...prev.slice(0, -1), newPoint];
        saveHistory(address, updated);
        return updated;
      }

      const updated = [...prev, newPoint];
      saveHistory(address, updated);
      return updated;
    });
  }, [address, totalValue, costBasis, impliedValuation, hasPositions]);

  // Format timestamp for chart
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Prepare chart data - prefer fetched portfolio history over localStorage
  const chartData = useMemo(() => {
    // If we have real portfolio history from API, use it
    if (portfolioHistory.length > 0) {
      return portfolioHistory.map(point => ({
        timestamp: point.timestamp,
        value: point.portfolioValue,
        costBasis: costBasis || 0,
      }));
    }

    // Fall back to localStorage history
    if (valueHistory.length > 0) {
      return valueHistory;
    }

    // Initialize with cost basis if no history
    if (costBasis && totalValue) {
      return [
        { timestamp: Date.now() - 3600000, value: costBasis, costBasis },
        { timestamp: Date.now(), value: totalValue, costBasis },
      ];
    }
    return [];
  }, [portfolioHistory, valueHistory, costBasis, totalValue]);

  // Calculate P&L
  const pnl = totalValue - (costBasis || 0);
  const pnlPercent = costBasis ? ((totalValue - costBasis) / costBasis) * 100 : 0;

  return (
    <div className="portfolio-charts">
      {/* Implied Valuation Display */}
      <div className="valuation-card">
        <div className="valuation-header">
          <span className="valuation-label">Implied SpaceX IPO Valuation</span>
          <span className="valuation-value">${(impliedValuation / 1000).toFixed(2)}T</span>
        </div>
        <div className="valuation-subtext">
          Based on current market probabilities
        </div>
      </div>

      {/* Implied Valuation Chart - Historical from Polymarket */}
      <div className="chart-container">
        <div className="chart-header">
          <h4>Implied Valuation History (Past Month)</h4>
          {isLoadingHistory && <span className="loading-indicator">Loading...</span>}
        </div>

        {historicalValuation.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={historicalValuation} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatDate}
                stroke="#888"
                fontSize={11}
                tickLine={false}
                minTickGap={50}
              />
              <YAxis
                stroke="#888"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) => `$${(v/1000).toFixed(1)}T`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(ts) => formatDate(ts) + ' ' + formatTime(ts)}
                formatter={(value) => [`$${(value/1000).toFixed(2)}T`, 'Implied Valuation']}
              />
              <Line
                type="monotone"
                dataKey="impliedValuation"
                stroke="#1A7D46"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : isLoadingHistory ? (
          <div className="chart-empty">
            Fetching historical market data...
          </div>
        ) : historyError ? (
          <div className="chart-empty chart-error">
            Failed to load history: {historyError}
          </div>
        ) : (
          <div className="chart-empty">
            No historical data available.
          </div>
        )}
      </div>

      {/* Portfolio Value Chart - Only shown when user has positions */}
      {hasPositions && (
      <div className="chart-container">
        <div className="chart-header">
          <h4>Portfolio Value {portfolioHistory.length > 0 ? '(24h)' : ''}</h4>
          <div className="chart-header-right">
            {isLoadingPortfolio && <span className="loading-indicator">Loading...</span>}
            <div className={`pnl-badge ${pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
              {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
            </div>
          </div>
        </div>

        {isLoadingPortfolio ? (
          <div className="chart-empty">
            Fetching portfolio price history...
          </div>
        ) : portfolioError ? (
          <div className="chart-empty chart-error">
            Failed to load portfolio history: {portfolioError}
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2952CC" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2952CC" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke="#888"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="#888"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(ts) => formatDate(ts) + ' ' + formatTime(ts)}
                formatter={(value, name) => [
                  `$${value.toFixed(2)}`,
                  name === 'value' ? 'Current Value' : 'Cost Basis'
                ]}
              />
              {/* Cost basis reference line */}
              {costBasis && (
                <ReferenceLine
                  y={costBasis}
                  stroke="#C4342D"
                  strokeDasharray="5 5"
                  label={{ value: 'Cost', position: 'left', fill: '#C4342D', fontSize: 10 }}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2952CC"
                strokeWidth={2}
                fill="url(#valueGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">
            No historical data yet. Value will be tracked over time.
          </div>
        )}
      </div>
      )}

      <style>{`
        .portfolio-charts {
          margin-top: 20px;
        }

        .valuation-card {
          background: linear-gradient(135deg, rgba(26,125,70,0.15), var(--bg-surface, #1a1a2e));
          border: 1px solid var(--green, #1A7D46);
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 16px;
        }

        .valuation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .valuation-label {
          font-size: 14px;
          color: var(--text-secondary, #888);
        }

        .valuation-value {
          font-size: 24px;
          font-weight: 700;
          font-family: var(--mono, 'DM Mono', monospace);
          color: var(--green, #1A7D46);
        }

        .valuation-subtext {
          font-size: 11px;
          color: var(--text-tertiary, #666);
          margin-top: 4px;
        }

        .chart-container {
          background: var(--bg-surface, #1a1a2e);
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .chart-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .chart-header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pnl-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          font-family: var(--mono, 'DM Mono', monospace);
        }

        .pnl-positive {
          background: rgba(26,125,70,0.2);
          color: var(--green, #1A7D46);
        }

        .pnl-negative {
          background: rgba(196,52,45,0.2);
          color: var(--red, #C4342D);
        }

        .chart-empty {
          height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary, #888);
          font-size: 13px;
        }

        .chart-error {
          color: var(--red, #C4342D);
        }

        .loading-indicator {
          font-size: 11px;
          color: var(--text-secondary, #888);
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
