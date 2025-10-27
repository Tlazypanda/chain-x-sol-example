import React, { useState } from 'react';
import { AdapterWallet } from "@aptos-labs/wallet-adapter-core"
import { AccountAddress } from "@aptos-labs/ts-sdk"
import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { SolanaDerivedWallet } from "@aptos-labs/derived-wallet-solana"


interface WalletPopupProps {
  wallets?: any[];
  notDetectedWallets?: any[];
  isOpen: boolean;
  onClose: () => void;
  onWalletConnect?: (walletName: string, address: string) => void;
}

const WalletPopup: React.FC<WalletPopupProps> = ({
  wallets = [] as readonly AdapterWallet[],
  notDetectedWallets = [] as readonly AdapterWallet[],
  isOpen,
  onClose,
  onWalletConnect
}) => {
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const {connect, connected, wallet} = useWallet();
  const dialogTitleId = 'wallet-popup-title';

  const handleWalletConnect = async (walletToConnect: AdapterWallet) => {
    try {
      setIsConnecting(walletToConnect.name);
      
      // Use useWallet connect method
      await connect(walletToConnect.name);
      
      console.log("Wallet connected successfully");
      
      // Call parent component callback function, pass wallet name and address
      if (onWalletConnect && wallet?.accounts && wallet.accounts.length > 0) {
        const address = wallet.accounts[0].address;
        onWalletConnect(walletToConnect.name, address);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      onClose();
      setIsConnecting(null);
    }
  };

  const handleInstallWallet = (wallet: any) => {
    if (wallet.downloadUrl) {
      window.open(wallet.downloadUrl, '_blank');
    } else if (wallet.url) {
      window.open(wallet.url, '_blank');
    } else if (wallet.installUrl) {
      window.open(wallet.installUrl, '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="wallet-popup-overlay" 
      onClick={onClose}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div 
        className="wallet-popup" 
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="wallet-popup-header">
          <h2 id={dialogTitleId}>Select Wallet</h2>
          <button className="wallet-popup-close" onClick={onClose}>
            ×
          </button>
        </div>
        
        <div className="wallet-popup-content">
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            Choose a Solana wallet to derive an Aptos address instantly. Installed wallets appear first, and you can install new options below.
          </p>
          {wallets.length > 0 && (
            <div className="wallet-section">
              <h3>Installed Wallets</h3>
              <div className="wallet-list">
                {wallets.filter((walletItem: AdapterWallet) => walletItem.name.toLocaleLowerCase().includes("solana") || walletItem.name.toLocaleLowerCase().includes("phantom") || walletItem.name.toLocaleLowerCase().includes("solflare") || walletItem.name.toLocaleLowerCase().includes("backpack")).map((walletItem: AdapterWallet, index: number) => {
                  // Use useWallet state to determine connection status
                  const isConnected = connected && wallet?.name === walletItem.name;
                  const isConnectingThis = isConnecting === walletItem.name;
                  
                  return (
                    <div
                      key={index}
                      className={`wallet-item installed ${isConnected ? 'connected' : ''} ${isConnectingThis ? 'connecting' : ''}`}
                      onClick={() => !isConnected && !isConnectingThis && handleWalletConnect(walletItem)}
                      style={{ 
                        opacity: isConnected ? 0.7 : 1
                      }}
                    >
                      <div className="wallet-icon">
                        {walletItem.icon ? (
                          <img src={walletItem.icon} alt={walletItem.name} />
                        ) : (
                          <div className="wallet-icon-placeholder">
                            {walletItem.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="wallet-info">
                        <span className="wallet-name">{walletItem.name}</span>
                        {isConnected ? (
                          <div className="wallet-connected-info">
                            <span className="wallet-status" style={{ color: '#16a34a' }}>Connected</span>
                            <span className="wallet-address" style={{ fontSize: '0.8em', color: '#666' }}>
                              {wallet?.accounts && wallet.accounts.length > 0 ? `${wallet.accounts[0].address.slice(0, 6)}...${wallet.accounts[0].address.slice(-4)}` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="wallet-status">Click to Connect</span>
                        )}
                      </div>
                      {isConnectingThis && (
                        <div className="wallet-loading">Connecting...</div>
                      )}
                      {isConnected && (
                        <div className="wallet-checkmark" style={{ color: '#16a34a', fontSize: '1.2em' }}>✓</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {notDetectedWallets.length > 0 && (
            <div className="wallet-section">
              <h3>Not Installed Wallets</h3>
              <div className="wallet-list">
                {notDetectedWallets.filter((wallet: AdapterWallet) => wallet.name.toLocaleLowerCase().includes("solana") || wallet.name.toLocaleLowerCase().includes("phantom") || wallet.name.toLocaleLowerCase().includes("solflare") || wallet.name.toLocaleLowerCase().includes("backpack")).map((wallet: AdapterWallet, index: number) => (
                  <div
                    key={index}
                    className="wallet-item not-installed"
                    onClick={() => handleInstallWallet(wallet)}
                  >
                    <div className="wallet-icon">
                      {wallet.icon ? (
                        <img src={wallet.icon} alt={wallet.name} />
                      ) : (
                        <div className="wallet-icon-placeholder">
                          {wallet.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="wallet-info">
                      <span className="wallet-name">{wallet.name}</span>
                      <span className="wallet-status">Click to Install</span>
                    </div>
                    <div className="wallet-action">
                      <span>Install</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {wallets.length === 0 && notDetectedWallets.length === 0 && (
            <div className="wallet-empty">
              <p>No available wallets</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletPopup;
