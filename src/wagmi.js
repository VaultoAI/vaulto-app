import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon, polygonAmoy } from 'wagmi/chains';

// Get project ID from WalletConnect Cloud (https://cloud.walletconnect.com)
// For development, you can use a placeholder
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

console.log('[wagmi] Configuring chains:', {
  polygon: { id: polygon.id, name: polygon.name },
  polygonAmoy: { id: polygonAmoy.id, name: polygonAmoy.name },
  projectId: projectId.substring(0, 8) + '...',
});

// Don't override transports - let RainbowKit/wallet handle RPC
// This avoids CORS issues since the wallet makes the RPC calls
export const config = getDefaultConfig({
  appName: 'Vaulto Trading',
  projectId,
  chains: [polygon, polygonAmoy],
  ssr: false,
});
