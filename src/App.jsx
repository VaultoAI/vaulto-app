import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';
import { useState, useEffect, useCallback } from 'react';

import { Header } from './components/Header';
import { MarketInfo } from './components/MarketInfo';
import { TradingPanel } from './components/TradingPanel';
import { Positions } from './components/Positions';
import { BandPrices } from './components/BandPrices';

import { fetchBandPrices } from './lib/polymarket';
import { calcFullBreakdown } from './lib/pricing';
import { CONFIG } from './lib/config';
import { POLYGON_CONTRACTS, CHAIN_IDS } from './lib/contracts';

// Startup diagnostics
console.log('=== VAULTO APP STARTUP ===');
console.log('Config:', {
  mode: CONFIG.mode,
  floorL: CONFIG.floorL,
  floorS: CONFIG.floorS,
  numBands: CONFIG.numBands,
  trading: CONFIG.trading,
});
console.log('Contract Addresses:', POLYGON_CONTRACTS);
console.log('Expected Chain IDs:', CHAIN_IDS);
console.log('Environment:', {
  hasApiKey: !!import.meta.env.VITE_POLYMARKET_API_KEY,
  hasSecret: !!import.meta.env.VITE_POLYMARKET_SECRET,
  hasPassphrase: !!import.meta.env.VITE_POLYMARKET_PASSPHRASE,
  hasWalletConnectId: !!import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
});
console.log('=========================');

function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [bands, setBands] = useState([]);
  const [event, setEvent] = useState(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Position state (for mock mode only)
  const [selectedPosition, setSelectedPosition] = useState('long');
  const [amount, setAmount] = useState(1);
  const [positions, setPositions] = useState({
    long: 0,
    short: 0,
    longCostBasis: 0,
    shortCostBasis: 0,
  });

  const isMockMode = CONFIG.mode === 'mock';

  // Log connection state
  useEffect(() => {
    console.log('[App] Connection state:', {
      isConnected,
      address,
      chainId,
      isPolygon: chainId === CHAIN_IDS.POLYGON,
      expectedChainId: CHAIN_IDS.POLYGON,
    });
  }, [isConnected, address, chainId]);

  // Load positions from localStorage (mock mode only)
  useEffect(() => {
    if (isMockMode && isConnected && address) {
      const stored = localStorage.getItem(`vaulto_positions_${address}`);
      if (stored) {
        try {
          setPositions(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to load positions:', e);
        }
      }
    }
  }, [isMockMode, isConnected, address]);

  // Save positions to localStorage (mock mode only)
  const savePositions = useCallback(
    (newPositions) => {
      if (isMockMode && address) {
        localStorage.setItem(
          `vaulto_positions_${address}`,
          JSON.stringify(newPositions)
        );
        setPositions(newPositions);
      }
    },
    [isMockMode, address]
  );

  // Fetch prices
  const loadPrices = useCallback(async () => {
    try {
      const data = await fetchBandPrices();
      setBands(data.bands);
      setEvent(data.event);
      setUsedFallback(data.usedFallback);
      setLastUpdate(Date.now());
      setBreakdown(calcFullBreakdown(data.bands, CONFIG.floorL, CONFIG.floorS));
      setError(null);
    } catch (e) {
      setError(e.message);
      console.error('Failed to load prices:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    loadPrices();
    const interval = setInterval(loadPrices, CONFIG.priceRefreshMs);
    return () => clearInterval(interval);
  }, [loadPrices]);

  // Handle buy (mock mode only - real mode handles in TradingPanel)
  const handleBuy = useCallback(() => {
    if (!breakdown || amount <= 0 || !isConnected || !isMockMode) return;

    const longCost = breakdown.longCost;
    const shortCost = breakdown.shortCost;

    // In mock mode, buying adds to both long and short positions
    // (simulating paired minting behavior)
    const newLong = positions.long + amount;
    const newShort = positions.short + amount;

    // Calculate weighted average cost basis
    const prevLongValue = positions.long * positions.longCostBasis;
    const newLongValue = amount * longCost;
    const newLongCostBasis =
      newLong > 0 ? (prevLongValue + newLongValue) / newLong : 0;

    const prevShortValue = positions.short * positions.shortCostBasis;
    const newShortValue = amount * shortCost;
    const newShortCostBasis =
      newShort > 0 ? (prevShortValue + newShortValue) / newShort : 0;

    savePositions({
      long: newLong,
      short: newShort,
      longCostBasis: newLongCostBasis,
      shortCostBasis: newShortCostBasis,
    });
  }, [breakdown, amount, isConnected, isMockMode, positions, savePositions]);

  return (
    <div className="app">
      <Header />

      <main className="app-container">
        <MarketInfo event={event} usedFallback={usedFallback} loading={loading} />

        <TradingPanel
          selectedPosition={selectedPosition}
          setSelectedPosition={setSelectedPosition}
          amount={amount}
          setAmount={setAmount}
          breakdown={breakdown}
          bands={bands}
          isConnected={isConnected}
          onBuy={handleBuy}
          loading={loading}
        />

        <Positions
          positions={positions}
          breakdown={breakdown}
          bands={bands}
          isConnected={isConnected}
        />

        <BandPrices breakdown={breakdown} lastUpdate={lastUpdate} />

        <footer className="footer">
          <p>
            Vaulto &bull; Synthetic Private Company Exposure &bull;{' '}
            <a
              href="https://github.com/vaulto"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </p>
          <p style={{ marginTop: '8px', fontSize: '11px' }}>
            {isMockMode ? (
              'Mock mode enabled. No real transactions.'
            ) : (
              <>
                Live trading on Polygon.{' '}
                <a
                  href="https://polygonscan.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit' }}
                >
                  View on PolygonScan
                </a>
              </>
            )}
          </p>
        </footer>
      </main>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

export default App;
