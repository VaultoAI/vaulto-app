import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <span className="logo-text">Vaulto</span>
        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus={{
            smallScreen: 'avatar',
            largeScreen: 'full',
          }}
        />
      </div>
    </header>
  );
}
