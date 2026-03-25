import { formatEndDate, formatUsd } from '../lib/polymarket';

export function MarketInfo({ event, usedFallback, loading }) {
  if (loading) {
    return (
      <section className="market-info-section">
        <div className="market-title">SpaceX IPO Closing Market Cap (Higher Strikes)</div>
        <div className="market-meta">Loading market data...</div>
      </section>
    );
  }

  const endDate = event ? formatEndDate(event.endDate) : 'December 31, 2027';
  const volume = event?.volume ? formatUsd(event.volume) : '---';
  const fallbackNote = usedFallback ? ' (cached data)' : '';

  return (
    <section className="market-info-section">
      <div className="market-title">SpaceX IPO Closing Market Cap (Higher Strikes)</div>
      <div className="market-meta">
        8 outcome bands &bull; Resolution: {endDate} &bull; Volume: {volume}
        {fallbackNote}
      </div>
    </section>
  );
}
