# On-Chain Signature Tutorial Example

Quickly experience common signature methods of Solana browser wallets using Vite + React + Aptos Derived Wallet, and complete signature verification on the frontend. The interface uses English descriptions to help beginners understand the role and differences of on-chain signatures with Solana wallets connected via Aptos.

## Feature Overview

- One-click connection to Solana browser wallets (Phantom, Solflare, Backpack, OKX, and others)
- Support for multi-network switching: Aptos Devnet, Testnet, and Mainnet
- Provides signature and transaction capabilities through Solana wallets using Aptos Derived Wallet
- After each signature, you can immediately verify and interact with Aptos blockchain
- Key code snippets are embedded in the page for easy learning and copying to your own projects

## Quick Start

> **Note**: Please run `npm install` before first run, internet connection is required to download dependencies.

```bash
npm install
npm run dev
```

Visit the local address output in the terminal in your browser (default `http://localhost:5173`). Make sure a Solana wallet (Phantom, Solflare, Backpack, or OKX) is installed and unlocked in your browser.

## Network Configuration

### Aptos Network Configuration

The project supports three Aptos network modes, controlled by the environment variable `VITE_APTOS_NETWORK`:

- **devnet**: Aptos Development Network
- **testnet**: Aptos Test Network (default)
- **mainnet**: Aptos Mainnet

#### Configuration Method

1. **Create environment variable file** `.env.local`:
```bash
# Set Aptos Network
VITE_APTOS_NETWORK=testnet

# Optional API Keys (for better performance)
VITE_APTOS_API_KEY_DEVNET=your_devnet_api_key
VITE_APTOS_API_KEY_TESTNET=your_testnet_api_key  
VITE_APTOS_API_KEY_MAINNET=your_mainnet_api_key
```

2. **Or set environment variables when starting**:
```bash
VITE_APTOS_NETWORK=devnet pnpm run dev
VITE_APTOS_NETWORK=mainnet pnpm run dev
```

### Solana Wallet Integration

This project uses the `@aptos-labs/derived-wallet-solana` package to enable Solana wallets to function as native Aptos wallets through Derivable Abstracted Accounts (DAA):

- **Supported Wallets**: Phantom, Solflare, Backpack, OKX
- **How it Works**: When users connect via Solana wallets, the adapter computes the user's Derivable Abstracted Account (DAA) address and converts the Solana account to follow the Aptos wallet standard interface
- **Network Support**: Currently available on Devnet and Testnet (Alpha feature)

**Important Considerations:**
- **Transaction simulation is unavailable** since Solana wallets aren't natively integrated with Aptos
- **Sponsored transactions are REQUIRED** for Solana-derived accounts to submit transactions, as they don't have APT for gas fees
- You need to set up a **sponsor/fee payer account** to pay for gas fees on behalf of users
- Access original Solana wallet details using: `wallet.solanaWallet.publicKey`

### Setting Up Sponsored Transactions

For production use, you'll need to:

1. **Create a sponsor account** with APT balance on testnet/mainnet
2. **Implement a backend service** that:
   - Receives transaction signatures from the frontend
   - Signs transactions as the fee payer using your sponsor account
   - Submits the combined transaction to the blockchain

3. **Alternative for Testing**: Use the faucet to fund the Solana-derived Aptos address directly:
   ```typescript
   // Get APT from faucet for testing (devnet/testnet only)
   await aptosClient.fundAccount({
     accountAddress: account.address,
     amount: 100000000 // 1 APT
   });
   ```

## Testing Recommendations

1. Install a Solana wallet extension (Phantom, Solflare, Backpack, or OKX) in your browser
2. Select the target Aptos network (Devnet or Testnet recommended for testing)
3. Connect your Solana wallet - it will be automatically converted to work with Aptos
4. Try signing messages and submitting transactions
5. Observe how your Solana wallet seamlessly interacts with the Aptos blockchain through the derived wallet functionality
6. Note: Make sure to use testnet/devnet as mainnet support may be limited for this alpha feature

## Project Structure

```
.
├── src
│   ├── App.tsx          // Page logic and UI
│   ├── codeSnippets.ts  // Code snippets displayed on the page
│   ├── main.tsx         // React entry point
│   ├── styles.css       // Base styles
│   └── vite-env.d.ts    // Global type declarations
├── index.html
├── package.json
└── vite.config.ts
```

## Future Extension Suggestions

- Implement sponsored transactions to cover gas fees for Solana wallet users who may not have APT
- Add support for additional Solana wallets as they become compatible with the Aptos adapter
- Move signature verification logic to the backend, combined with JWT or Session to implement on-chain login
- Record time and context for each signature to facilitate auditing in business systems
- Explore accessing native Solana wallet features through `wallet.solanaWallet` properties