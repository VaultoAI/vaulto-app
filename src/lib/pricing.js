/**
 * Weight and Cost Calculations
 * Implements the weight formulas from WeightCalculator.sol
 */

import { CONFIG, BAND_META } from './config';

/**
 * Calculate LONG weight for a specific band
 */
export function calcLongWeight(bandIndex, numBands = CONFIG.numBands, floorL = CONFIG.floorL) {
  if (numBands === 1) return 1.0;
  const range = 1 - floorL;
  const scaledIndex = bandIndex / (numBands - 1);
  return floorL + range * scaledIndex;
}

/**
 * Calculate SHORT weight for a specific band
 */
export function calcShortWeight(bandIndex, numBands = CONFIG.numBands, floorS = CONFIG.floorS) {
  if (numBands === 1) return 1.0;
  const range = 1 - floorS;
  const inverseBandIndex = numBands - 1 - bandIndex;
  const scaledIndex = inverseBandIndex / (numBands - 1);
  return floorS + range * scaledIndex;
}

/**
 * Calculate acquisition cost for LONG token
 */
export function calcLongCost(bands, floorL = CONFIG.floorL) {
  let cost = 0;
  const numBands = bands.length;
  for (let i = 0; i < numBands; i++) {
    const weight = calcLongWeight(i, numBands, floorL);
    cost += weight * bands[i].price;
  }
  return cost;
}

/**
 * Calculate acquisition cost for SHORT token
 */
export function calcShortCost(bands, floorS = CONFIG.floorS) {
  let cost = 0;
  const numBands = bands.length;
  for (let i = 0; i < numBands; i++) {
    const weight = calcShortWeight(i, numBands, floorS);
    cost += weight * bands[i].price;
  }
  return cost;
}

/**
 * Calculate P&L for a position
 */
export function calcPnL(costBasis, currentValue) {
  const pnl = currentValue - costBasis;
  const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  return { pnl, pnlPercent };
}

/**
 * Calculate detailed breakdown for display
 */
export function calcFullBreakdown(bands, floorL = CONFIG.floorL, floorS = CONFIG.floorS) {
  const numBands = bands.length;
  const longCost = calcLongCost(bands, floorL);
  const shortCost = calcShortCost(bands, floorS);

  const breakdown = bands.map((band, i) => {
    const lw = calcLongWeight(i, numBands, floorL);
    const sw = calcShortWeight(i, numBands, floorS);

    return {
      ...band,
      longWeight: lw,
      shortWeight: sw,
      longPayoff: lw,
      shortPayoff: sw,
      longPnl: lw - longCost,
      shortPnl: sw - shortCost,
      longReturn: ((lw / longCost) - 1) * 100,
      shortReturn: ((sw / shortCost) - 1) * 100,
    };
  });

  const bestLongReturn = ((calcLongWeight(numBands - 1, numBands, floorL) / longCost) - 1) * 100;
  const worstLongReturn = ((calcLongWeight(0, numBands, floorL) / longCost) - 1) * 100;
  const bestShortReturn = ((calcShortWeight(0, numBands, floorS) / shortCost) - 1) * 100;
  const worstShortReturn = ((calcShortWeight(numBands - 1, numBands, floorS) / shortCost) - 1) * 100;

  return {
    breakdown,
    longCost,
    shortCost,
    bestLongReturn,
    worstLongReturn,
    bestShortReturn,
    worstShortReturn,
    floorL,
    floorS,
  };
}
