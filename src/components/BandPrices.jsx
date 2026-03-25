import { useState, useEffect } from 'react';

export function BandPrices({ breakdown, lastUpdate }) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    if (!lastUpdate) return;

    const updateSeconds = () => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate) / 1000));
    };

    updateSeconds();
    const interval = setInterval(updateSeconds, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  return (
    <section className="band-prices-section">
      <div className="band-prices-header">
        <h3 className="section-title">Live Band Prices</h3>
        <span className="last-updated">
          {lastUpdate ? `Last updated: ${secondsAgo} seconds ago` : 'Loading...'}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Band</th>
              <th>YES Price</th>
              <th>LONG Wt</th>
              <th>SHORT Wt</th>
            </tr>
          </thead>
          <tbody>
            {breakdown ? (
              breakdown.breakdown.map((band) => (
                <tr key={band.index}>
                  <td>
                    <strong>{band.label}</strong>
                  </td>
                  <td className="mono">{(band.price * 100).toFixed(1)}c</td>
                  <td className="mono">{band.longWeight.toFixed(3)}</td>
                  <td className="mono">{band.shortWeight.toFixed(3)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Loading prices...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
