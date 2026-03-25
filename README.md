# Vaulto Trading App

A Polymarket-based trading interface for synthetic SpaceX exposure via prediction market bands.

## Overview

Vaulto enables users to trade SpaceX IPO prediction market positions on Polymarket. The app provides weighted exposure across multiple valuation bands, real-time price tracking, and portfolio analytics.

## Features

- **Real-time Band Prices** - Live prices from Polymarket Gamma API for all SpaceX IPO valuation bands
- **On-chain Trading** - Buy and sell YES tokens via Polymarket CLOB API on Polygon
- **Position Tracking** - ERC-1155 token balance tracking for all band positions
- **Portfolio Charts** - 24-hour portfolio value history based on real market prices
- **Implied Valuation** - Probability-weighted IPO valuation with 1-month historical chart
- **Wallet Integration** - RainbowKit with MetaMask, WalletConnect, and other providers

## Tech Stack

- **Frontend**: React + Vite
- **Blockchain**: Polygon (MATIC)
- **Wallet**: wagmi + viem + RainbowKit
- **Trading**: Polymarket CLOB Client
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+
- A Web3 wallet (MetaMask, Rainbow, etc.)
- USDC.e on Polygon for trading

### Installation

```bash
# Clone the repository
git clone https://github.com/VaultoAI/vaulto-app.git
cd vaulto-app

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file with the following:

```env
# WalletConnect Project ID (required)
# Get one at https://cloud.walletconnect.com
VITE_WALLETCONNECT_PROJECT_ID=your_project_id

# Optional: Pre-configured Polymarket API credentials
# If not set, the app will derive credentials via wallet signature
# VITE_POLYMARKET_API_KEY=
# VITE_POLYMARKET_SECRET=
# VITE_POLYMARKET_PASSPHRASE=
```

## Usage

1. **Connect Wallet** - Click "Connect Wallet" and select your provider
2. **Switch to Polygon** - Ensure you're on Polygon mainnet (chain ID 137)
3. **View Prices** - See live prices for each SpaceX IPO valuation band
4. **Buy Tokens** - Enter token amount and click BUY (minimum 25 tokens total)
5. **Track Positions** - View your band positions and portfolio value
6. **Sell Tokens** - Enter amount per band and click SELL

## Architecture

```
src/
├── components/
│   ├── BandPrices.jsx      # Price display for all bands
│   ├── Header.jsx          # App header with wallet connect
│   ├── PortfolioCharts.jsx # Value and valuation charts
│   ├── Positions.jsx       # User position management
│   ├── TradingPanel.jsx    # Buy interface
│   └── TransactionModal.jsx # Transaction status modal
├── hooks/
│   ├── useApprovals.js     # USDC and ERC-1155 approvals
│   ├── useOnChainPositions.js # ERC-1155 balance queries
│   ├── useTradeHistory.js  # Trade history and cost basis
│   └── useTrading.js       # CLOB trading operations
├── lib/
│   ├── abis/               # Contract ABIs
│   ├── clobService.js      # Polymarket CLOB client
│   ├── config.js           # App configuration
│   ├── contracts.js        # Contract addresses
│   ├── polymarket.js       # Gamma API integration
│   └── pricing.js          # Price calculations
└── wagmi.js                # Wallet configuration
```

## Contracts

| Contract | Address |
|----------|---------|
| CTF Exchange | `0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e` |
| Conditional Tokens | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` |
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |

## Trading Notes

- **Minimum Order**: 5 tokens per band (25+ tokens recommended for weighted distribution)
- **Tick Size**: 0.01 (1 cent increments)
- **USDC Type**: Polymarket uses bridged USDC.e, not native USDC
- **Approvals**: Two approvals required - USDC for buying, ERC-1155 for selling

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

MIT

## Links

- [Polymarket](https://polymarket.com)
- [Polymarket CLOB Docs](https://docs.polymarket.com)
- [Polygon](https://polygon.technology)
