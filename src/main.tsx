import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { setupAutomaticSolanaWalletDerivation } from "@aptos-labs/derived-wallet-solana";
import { PropsWithChildren } from "react";
import { Network } from "@aptos-labs/ts-sdk";
import { NetworkProvider } from './contexts/NetworkContext';

setupAutomaticSolanaWalletDerivation({ defaultNetwork: Network.TESTNET }); // Network.TESTNET is the Aptos network your dapp is working with

let dappImageURI: string | undefined;
if (typeof window !== "undefined") {
  dappImageURI = `${window.location.origin}${window.location.pathname}favicon.ico`;
}

const WalletProvider = ({ children }: PropsWithChildren) => {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: Network.TESTNET, // Default network, will be overridden by context
        aptosApiKeys: {
          testnet: import.meta.env.VITE_APTOS_API_KEY_TESTNET,
          devnet: import.meta.env.VITE_APTOS_API_KEY_DEVNET,
          mainnet: import.meta.env.VITE_APTOS_API_KEY_MAINNET,
        },
        aptosConnect: {
          claimSecretKey: false,
          dappId: "57fa42a9-29c6-4f1e-939c-4eefa36d9ff5",
          dappImageURI,
        },
        mizuwallet: {
          manifestURL:
            "https://assets.mz.xyz/static/config/mizuwallet-connect-manifest.json",
        },
        crossChainWallets: true,
      }}
      onError={(error: any) => {
        console.error(error); 
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
};




ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <NetworkProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </NetworkProvider>
  </React.StrictMode>
);

