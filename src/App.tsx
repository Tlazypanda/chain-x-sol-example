import { useEffect, useState, type ReactNode } from 'react';
import { Network, Account, Ed25519PrivateKey, AccountAuthenticatorSingleKey, Ed25519PublicKey, Ed25519Signature, AnyPublicKey, AnySignature } from '@aptos-labs/ts-sdk';
import { useAptosClient, useNetworkContext } from './contexts/NetworkContext';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import WalletPopup from './WalletPopup';
import { setupAutomaticSolanaWalletDerivation } from '@aptos-labs/derived-wallet-solana';
import ToastContainer from './ToastContainer';
import { useToast } from './useToast';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';


// Aptos Network Configuration
const APTOS_NETWORKS = {
  devnet: {
    name: 'Aptos Devnet',
    network: Network.DEVNET,
    description: 'Aptos Development Network'
  },
  testnet: {
    name: 'Aptos Testnet', 
    network: Network.TESTNET,
    description: 'Aptos Test Network'
  },
  mainnet: {
    name: 'Aptos Mainnet',
    network: Network.MAINNET,
    description: 'Aptos Mainnet'
  }
} as const;

type AptosNetworkType = keyof typeof APTOS_NETWORKS;
type MobileActionId = 'sign-message' | 'sign-transaction' | 'custom-transaction';

type MessageSignatureInfo = {
  type: 'message';
  message: string;
  signature: unknown;
  timestamp: string;
};

type VerifiedMessageSignatureInfo = {
  type: 'sign_verify';
  message: string;
  signature: unknown;
  nonce: string;
  timestamp: string;
};

type TransferSignatureInfo = {
  type: 'transfer_sign';
  amount: string;
  recipient: string;
  authenticator: unknown;
  rawTransaction: unknown;
  timestamp: string;
};

type CustomSignatureInfo = {
  type: 'custom_sign';
  function: string;
  typeArguments: string[];
  arguments: string[];
  maxGas: string;
  gasPrice: string;
  authenticator: unknown;
  rawTransaction: unknown;
  timestamp: string;
};

type SignatureInfo =
  | MessageSignatureInfo
  | VerifiedMessageSignatureInfo
  | TransferSignatureInfo
  | CustomSignatureInfo;

type TransferTransactionStatus = {
  type: 'transfer_submit';
  hash: string;
  amount: string;
  recipient: string;
  status: string;
  timestamp: string;
};

type CustomTransactionStatus = {
  type: 'custom';
  hash: string;
  function: string;
  typeArguments: string[];
  arguments: string[];
  maxGas: string;
  gasPrice: string;
  status: string;
  timestamp: string;
};

type TransactionStatusInfo = TransferTransactionStatus | CustomTransactionStatus;

type ThemeKey = 'blue' | 'green' | 'purple';

type ThemeConfig = {
  container: string;
  heading: string;
  label: string;
  text: string;
  pill: string;
  codeBg: string;
  button: string;
};

const themeStyles: Record<ThemeKey, ThemeConfig> = {
  blue: {
    container: 'bg-blue-50 border border-blue-200',
    heading: 'text-blue-800',
    label: 'text-blue-700',
    text: 'text-blue-800',
    pill: 'text-blue-600 bg-blue-100',
    codeBg: 'bg-blue-100',
    button: 'text-blue-600 hover:text-blue-800 hover:bg-blue-100'
  },
  green: {
    container: 'bg-green-50 border border-green-200',
    heading: 'text-green-800',
    label: 'text-green-700',
    text: 'text-green-800',
    pill: 'text-green-600 bg-green-100',
    codeBg: 'bg-green-100',
    button: 'text-green-600 hover:text-green-800 hover:bg-green-100'
  },
  purple: {
    container: 'bg-purple-50 border border-purple-200',
    heading: 'text-purple-800',
    label: 'text-purple-700',
    text: 'text-purple-800',
    pill: 'text-purple-600 bg-purple-100',
    codeBg: 'bg-purple-100',
    button: 'text-purple-600 hover:text-purple-800 hover:bg-purple-100'
  }
};

const signatureMeta: Record<SignatureInfo['type'], { title: string; theme: ThemeKey }> = {
  message: { title: 'Message Signature', theme: 'blue' },
  sign_verify: { title: 'Message Signature & Verification', theme: 'blue' },
  transfer_sign: { title: 'Transaction Signature', theme: 'blue' },
  custom_sign: { title: 'Custom Transaction Signature', theme: 'purple' }
};

const transactionStatusMeta: Record<TransactionStatusInfo['type'], { title: string; theme: ThemeKey }> = {
  transfer_submit: { title: 'Transfer Transaction Status', theme: 'green' },
  custom: { title: 'Custom Transaction Status', theme: 'purple' }
};

const formatAddress = (value: string | null | undefined) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : 'Not Connected';

const safeStringify = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('Failed to stringify value', error);
    return String(value);
  }
};

const truncate = (value: string, length = 60): string =>
  value.length > length ? `${value.slice(0, length)}...` : value;

// Helper function to handle Solana-derived wallet authenticators
const convertAuthenticator = (authenticatorData: any): any => {
  try {
    // If it's already in the correct format, return as-is
    if (authenticatorData instanceof AccountAuthenticatorSingleKey) {
      return authenticatorData;
    }

    // Check if this is a Solana-derived account authenticator
    // These have functionInfo, abstractionSignature, signingMessageDigest, accountIdentity
    if (authenticatorData?.functionInfo && authenticatorData?.abstractionSignature) {
      console.log('Detected Solana-derived account authenticator - returning as-is');
      // Solana-derived account authenticators are already in the correct format
      // The SDK knows how to handle these special authenticators
      return authenticatorData;
    }

    // Extract public key and signature from standard nested structure
    const publicKeyData = authenticatorData?.public_key?.key?.data;
    const signatureData = authenticatorData?.signature?.data?.data;

    if (publicKeyData && signatureData) {
      // Convert object with numeric keys to Uint8Array
      const pubKeyArray = new Uint8Array(Object.values(publicKeyData));
      const sigArray = new Uint8Array(Object.values(signatureData));

      // Create proper Aptos SDK objects
      const ed25519PublicKey = new Ed25519PublicKey(pubKeyArray);
      const ed25519Signature = new Ed25519Signature(sigArray);

      // Wrap in Any* types for AccountAuthenticatorSingleKey
      const publicKey = new AnyPublicKey(ed25519PublicKey);
      const signature = new AnySignature(ed25519Signature);

      // Return proper AccountAuthenticator
      return new AccountAuthenticatorSingleKey(publicKey, signature);
    }

    // If we can't convert, return as-is and let SDK handle it
    console.warn('Could not convert authenticator, returning original:', authenticatorData);
    return authenticatorData;
  } catch (error) {
    console.error('Error converting authenticator:', error);
    return authenticatorData;
  }
};

// Sponsor account setup for fee payer
// In production, this should be stored securely on a backend server
// For demo purposes, we'll create/retrieve from localStorage
const getSponsorAccount = (network: Network): Account => {
  const storageKey = `sponsor-account-${network}`;

  try {
    // Try to get existing sponsor from localStorage
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const { privateKey } = JSON.parse(stored);
      return Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(privateKey)
      });
    }
  } catch (error) {
    console.warn('Failed to retrieve sponsor account from storage:', error);
  }

  // Create new sponsor account
  const newSponsor = Account.generate();
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      privateKey: newSponsor.privateKey.toString(),
      address: newSponsor.accountAddress.toString()
    }));
  } catch (error) {
    console.warn('Failed to store sponsor account:', error);
  }

  return newSponsor;
};

function App() {
  const { selectedAptosNetwork, setSelectedAptosNetwork } = useNetworkContext();
  const aptosClient = useAptosClient();
  const { toasts, removeToast, showSuccess, showError, showInfo } = useToast();
  
  // Transaction related states
  const [transferAmount, setTransferAmount] = useState<string>('1000');
  const [transferRecipient, setTransferRecipient] = useState<string>('0x1');
  const [message, setMessage] = useState('Hello Aptos!');
  const [error, setError] = useState<string>('');
  const [isSigning, setIsSigning] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [showWalletPopup, setShowWalletPopup] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [activeMobileAction, setActiveMobileAction] = useState<MobileActionId>('custom-transaction');
  
  // Transaction status tracking
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatusInfo | null>(null);
  
  // Balance and faucet states
  const [balance, setBalance] = useState<string>('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isFaucetLoading, setIsFaucetLoading] = useState(false);

  // Sponsor account for fee payer
  const [sponsorAccount, setSponsorAccount] = useState<Account | null>(null);
  const [sponsorBalance, setSponsorBalance] = useState<string>('0');

  const mobileActionTabs = [
    {
      id: 'sign-message' as const,
      label: 'Sign Message',
      description: 'Authenticate with a signed note',
      step: '1',
      activeClasses: 'bg-blue-600 text-white shadow-lg shadow-blue-200',
      inactiveClasses: 'bg-white border border-blue-100 text-blue-700'
    },
    {
      id: 'sign-transaction' as const,
      label: 'Transfer',
      description: 'Sign or submit a payment',
      step: '2',
      activeClasses: 'bg-green-600 text-white shadow-lg shadow-green-200',
      inactiveClasses: 'bg-white border border-green-100 text-green-700'
    },
    {
      id: 'custom-transaction' as const,
      label: 'Custom Tx',
      description: 'Call any Move entry function',
      step: '3',
      activeClasses: 'bg-purple-600 text-white shadow-lg shadow-purple-200',
      inactiveClasses: 'bg-white border border-purple-100 text-purple-700'
    }
  ];
  
  // Custom Transaction states
  const [customFunction, setCustomFunction] = useState<string>('0x1::coin::transfer');
  const [customGenericParams, setCustomGenericParams] = useState<string[]>(['0x1::aptos_coin::AptosCoin']);
  const [customArguments, setCustomArguments] = useState<string[]>(['0x1', '1000']);
  const [customMaxGas, setCustomMaxGas] = useState<string>('2000');
  const [customGasPrice, setCustomGasPrice] = useState<string>('100');

  const { wallets = [], notDetectedWallets = [], connected, wallet, disconnect, account,network, signMessage, signTransaction, signMessageAndVerify} = useWallet();

  const currentNetworkEntry = Object.entries(APTOS_NETWORKS).find(
    ([, config]) => config.network === selectedAptosNetwork
  ) as [AptosNetworkType, (typeof APTOS_NETWORKS)[AptosNetworkType]] | undefined;
  const currentNetworkKey = (currentNetworkEntry?.[0] ?? 'testnet') as AptosNetworkType;
  const currentNetworkLabel = currentNetworkEntry?.[1].name ?? APTOS_NETWORKS.testnet.name;

  // Get network explorer URL
  const getExplorerUrl = (hash: string) => {
    const networkName = currentNetworkKey;
    switch (networkName) {
      case 'devnet':
        return `https://explorer.aptoslabs.com/txn/${hash}?network=devnet`;
      case 'testnet':
        return `https://explorer.aptoslabs.com/txn/${hash}?network=testnet`;
      case 'mainnet':
        return `https://explorer.aptoslabs.com/txn/${hash}?network=mainnet`;
      default:
        return `https://explorer.aptoslabs.com/txn/${hash}`;
    }
  };

  useEffect(() => {
    setupAutomaticSolanaWalletDerivation({ defaultNetwork: selectedAptosNetwork });
  }, [selectedAptosNetwork]);

  // Initialize sponsor account when network changes
  useEffect(() => {
    const sponsor = getSponsorAccount(selectedAptosNetwork);
    setSponsorAccount(sponsor);
  }, [selectedAptosNetwork]);

  // Fetch balance function
  const fetchBalance = async () => {
    if (!account?.address) {
      setBalance('0');
      return;
    }

    try {
      setIsLoadingBalance(true);
      const balance = await aptosClient.getAccountAPTAmount({
        accountAddress: account.address.toString()
      });
      setBalance(balance.toString());
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      setBalance('0');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // Fetch sponsor balance function
  const fetchSponsorBalance = async () => {
    if (!sponsorAccount) {
      setSponsorBalance('0');
      return;
    }

    try {
      const balance = await aptosClient.getAccountAPTAmount({
        accountAddress: sponsorAccount.accountAddress.toString()
      });
      setSponsorBalance(balance.toString());
    } catch (error) {
      console.log('Sponsor account not yet funded:', sponsorAccount.accountAddress.toString());
      setSponsorBalance('0');
    }
  };

  // Fetch balance when account or network changes
  useEffect(() => {
    if (connected && account) {
      fetchBalance();
    } else {
      setBalance('0');
    }
  }, [connected, account, selectedAptosNetwork]);

  // Fetch sponsor balance when sponsor account changes
  useEffect(() => {
    if (sponsorAccount) {
      fetchSponsorBalance();
    }
  }, [sponsorAccount, selectedAptosNetwork]);

  // Auto-refresh balance every 5 seconds
  useEffect(() => {
    if (!connected || !account) return;

    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [connected, account, selectedAptosNetwork]);

  // Auto-refresh sponsor balance every 5 seconds
  useEffect(() => {
    if (!sponsorAccount) return;

    const interval = setInterval(fetchSponsorBalance, 5000);
    return () => clearInterval(interval);
  }, [sponsorAccount, selectedAptosNetwork]);

  // Faucet functions
  const handleDevnetFaucet = async () => {
    if (!account?.address) return;

    try {
      setIsFaucetLoading(true);
      const faucetUrl = 'https://faucet.devnet.aptoslabs.com/fund';
      const response = await fetch(faucetUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          address: account.address.toString(),
          amount: 50000000, // 0.5 APT in micro APT
        }),
      });

      if (response.ok) {
        showSuccess('Faucet Success', '0.5 APT has been added to your account', 3000);
        // Refresh balance after successful faucet
        setTimeout(fetchBalance, 2000);
      } else {
        throw new Error('Faucet request failed');
      }
    } catch (error) {
      console.error('Faucet failed:', error);
      showError('Faucet Failed', 'Unable to get tokens from faucet', 3000);
    } finally {
      setIsFaucetLoading(false);
    }
  };

  const handleTestnetFaucet = () => {
    if (!account?.address) return;

    const faucetUrl = `https://aptos.dev/network/faucet?address=${account.address.toString()}`;
    window.open(faucetUrl, '_blank');
  };

  // Sponsor account faucet functions
  const handleSponsorDevnetFaucet = async () => {
    if (!sponsorAccount) return;

    try {
      setIsFaucetLoading(true);
      const faucetUrl = 'https://faucet.devnet.aptoslabs.com/fund';
      const response = await fetch(faucetUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 100000000,
          address: sponsorAccount.accountAddress.toString(),
        }),
      });

      if (response.ok) {
        showSuccess('Sponsor Faucet Success', '1 APT has been added to sponsor account', 3000);
        // Refresh sponsor balance after a short delay
        setTimeout(fetchSponsorBalance, 2000);
      } else {
        throw new Error('Sponsor faucet request failed');
      }
    } catch (error) {
      console.error('Sponsor faucet failed:', error);
      showError('Sponsor Faucet Failed', 'Unable to get tokens for sponsor account', 3000);
    } finally {
      setIsFaucetLoading(false);
    }
  };

  const handleSponsorTestnetFaucet = () => {
    if (!sponsorAccount) return;

    const faucetUrl = `https://aptos.dev/network/faucet?address=${sponsorAccount.accountAddress.toString()}`;
    window.open(faucetUrl, '_blank');
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 767) {
      return;
    }
    setSignatureInfo(null);
    setTransactionStatus(null);
  }, [activeMobileAction]);

  const handleWalletConnect = (walletName: string, address: string) => {
    showSuccess('Wallet Connected Successfully', `${walletName} connected: ${formatAddress(address)}`, 3000);
  };

  const handleWalletDisconnect = async () => {
    try {
      disconnect();
      showInfo('Wallet Disconnected', 'Wallet connection has been disconnected', 2000);
    } catch (error) {
      console.error('Disconnect failed:', error);
      showError('Disconnect Failed', 'Unable to disconnect wallet', 3000);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`${label} Copied`, 'Content copied to clipboard', 2000);
    } catch (err) {
      showError('Copy Failed', `Unable to copy to clipboard: ${err}`, 3000);
    }
  };

  // Custom Transaction helper functions
  const addCustomGenericParam = () => {
    setCustomGenericParams([...customGenericParams, '']);
  };

  const removeCustomGenericParam = (index: number) => {
    setCustomGenericParams(customGenericParams.filter((_, i) => i !== index));
  };

  const updateCustomGenericParam = (index: number, value: string) => {
    const newParams = [...customGenericParams];
    newParams[index] = value;
    setCustomGenericParams(newParams);
  };

  const addCustomArgument = () => {
    setCustomArguments([...customArguments, '']);
  };

  const removeCustomArgument = (index: number) => {
    setCustomArguments(customArguments.filter((_, i) => i !== index));
  };

  const updateCustomArgument = (index: number, value: string) => {
    const newArgs = [...customArguments];
    newArgs[index] = value;
    setCustomArguments(newArgs);
  };

  const resetCustomTransaction = () => {
    setCustomFunction('0x1::coin::transfer');
    setCustomGenericParams(['0x1::aptos_coin::AptosCoin']);
    setCustomArguments(['0x1', '1000']);
    setCustomMaxGas('2000');
    setCustomGasPrice('100');
  };

  // View transaction details
  const viewTransactionDetails = (transaction: any) => {
    setSelectedTransaction(transaction);
    setShowTransactionModal(true);
  };



  const switchAptosNetwork = (networkType: AptosNetworkType) => {
    try {
      setError('');
      const network = APTOS_NETWORKS[networkType];
      setSelectedAptosNetwork(network.network);
      showSuccess('Network Switch Successful', `Switched to ${network.name}`, 2000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      showError('Network Switch Failed', reason, 3000);
    }
  };

  // Sign transfer transaction (sign only, do not submit)
  const signTransferTransaction = async () => {
    try {
      setError('');
      setIsSigning(true);
      // Clear previous states
      setSignatureInfo(null);
      setTransactionStatus(null);

      if (!account) {
        throw new Error('Please connect wallet first');
      }

      const { authenticator, rawTransaction } = await signTransaction({
        transactionOrPayload: {
          data: {
            function: "0x1::aptos_account::transfer",
            functionArguments: [
              transferRecipient,
              parseInt(transferAmount)
            ]
          },
          options: {
            maxGasAmount: 1500,
            gasUnitPrice: 100,
          }
        }
      });

      const transactionData = {
        type: 'transfer_sign',
        authenticator: authenticator,
        rawTransaction: rawTransaction,
        amount: transferAmount,
        recipient: transferRecipient,
        timestamp: new Date().toISOString()
      };

      setLastTransaction(transactionData);
      setTransactionHistory(prev => [transactionData, ...prev]);
      setSignatureInfo({
        type: 'transfer_sign',
        authenticator: authenticator,
        rawTransaction: rawTransaction,
        amount: transferAmount,
        recipient: transferRecipient,
        timestamp: new Date().toISOString()
      });
      showSuccess('Transaction Signed Successfully', 'Transfer transaction signed, You can check the signature result.', 3000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      showError('Signing Failed', reason, 4000);
    } finally {
      setIsSigning(false);
    }
  };

  // Sign and submit transfer transaction with fee payer (sponsored transaction)
  const submitTransferTransaction = async () => {
    try {
      setError('');
      setIsSigning(true);
      // Clear previous states
      setSignatureInfo(null);
      setTransactionStatus(null);

      if (!account) {
        throw new Error('Please connect wallet first');
      }

      if (!sponsorAccount) {
        throw new Error('Sponsor account not initialized');
      }

      // Check if sponsor has sufficient balance
      const sponsorBalanceNum = parseInt(sponsorBalance);
      if (sponsorBalanceNum < 150000) {
        showError(
          'Sponsor Account Needs Funding',
          `The sponsor account (${sponsorAccount.accountAddress.toString().slice(0, 10)}...) needs APT to pay gas fees. Please fund it using the faucet button that will appear.`,
          8000
        );
        throw new Error(`Sponsor account needs funding. Address: ${sponsorAccount.accountAddress.toString()}`);
      }

      showInfo('Building Transaction', 'Creating sponsored transaction with fee payer...', 2000);

      // Build transaction with fee payer
      const transaction = await aptosClient.transaction.build.simple({
        sender: account.address,
        withFeePayer: true,
        data: {
          function: "0x1::aptos_account::transfer",
          functionArguments: [
            transferRecipient,
            parseInt(transferAmount)
          ]
        },
        options: {
          maxGasAmount: 2000,
          gasUnitPrice: 100,
        }
      });

      showInfo('Signing Transaction', 'Requesting signature from your wallet...', 2000);

      // User signs the transaction using wallet adapter
      // const { authenticator: rawSenderAuthenticator } = await signTransaction({
      //   transactionOrPayload: transaction,
      // });

      // console.log('Raw sender authenticator:', rawSenderAuthenticator);

      // // Convert authenticator to proper format for Aptos SDK
      // const senderAuthenticator = convertAuthenticator(rawSenderAuthenticator);

      const walletSignedTransaction = await signTransaction({
        transactionOrPayload: transaction,
      });
      //console.log('Converted sender authenticator:', senderAuthenticator);

      showInfo('Sponsor Signing', 'Sponsor is signing as fee payer...', 2000);

      // Sponsor signs as fee payer
      const feePayerAuthenticator = aptosClient.transaction.signAsFeePayer({
        signer: sponsorAccount,
        transaction
      });

      console.log('Fee payer authenticator:', feePayerAuthenticator);

      showInfo('Submitting Transaction', 'Sending to blockchain...', 2000);

      // Submit with both authenticators
      const response = await aptosClient.transaction.submit.simple({
        transaction,
        senderAuthenticator: walletSignedTransaction.authenticator,
        feePayerAuthenticator
      });

      const transactionData = {
        type: 'transfer_submit',
        hash: response.hash,
        amount: transferAmount,
        recipient: transferRecipient,
        timestamp: new Date().toISOString()
      };

      setLastTransaction(transactionData);
      setTransactionHistory(prev => [transactionData, ...prev]);
      setTransactionStatus({
        type: 'transfer_submit',
        hash: response.hash,
        amount: transferAmount,
        recipient: transferRecipient,
        status: 'submitted',
        timestamp: new Date().toISOString()
      });
      showSuccess('Transaction Submitted Successfully', `Hash: ${response.hash.slice(0, 20)}...${response.hash.slice(-8)}`, 4000);

      // Refresh balances after successful transaction
      setTimeout(() => {
        fetchBalance();
        fetchSponsorBalance(); // Refresh sponsor balance since it paid gas fees
      }, 2000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      showError('Transaction Submission Failed', reason, 6000);
    } finally {
      setIsSigning(false);
    }
  };


  // Message signing
  const signMessageAction = async () => {
    try {
      setError('');
      setIsSigning(true);
      // Clear previous states
      setSignatureInfo(null);
      setTransactionStatus(null);

      if (!account) {
        throw new Error('Please connect wallet first');
      }

      const signature = await signMessage({
        message: message,
        nonce: crypto.randomUUID().replaceAll("-", ""),
      });

      const messageData = {
        type: 'message',
        message: message,
        signature: signature,
        timestamp: new Date().toISOString()
      };

      setLastTransaction(messageData);
      setTransactionHistory(prev => [messageData, ...prev]);
      setSignatureInfo({
        type: 'message',
        message: message,
        signature: signature,
        timestamp: new Date().toISOString()
      });
      showSuccess('Message Signed Successfully', 'Message has been signed successfully', 3000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      showError('Message Signing Failed', reason, 4000);
    } finally {
      setIsSigning(false);
    }
  };
 
  const signMessageAndVerifyAction = async () => {
    try {
      setError('');
      setIsSigning(true);
      // Clear previous states
      setSignatureInfo(null);
      setTransactionStatus(null);

      if (!account) {
        throw new Error('Please connect wallet first');
      }

      const nonce = crypto.randomUUID().replaceAll("-", "");
      const signature = await signMessageAndVerify({
        message: message,
        nonce: nonce,
      });

      const messageData = {
        type: 'sign_verify',
        message: message,
        signature: signature,
        nonce: nonce,
        timestamp: new Date().toISOString()
      };

      setLastTransaction(messageData);
      setTransactionHistory(prev => [messageData, ...prev]);
      setSignatureInfo({
        type: 'sign_verify',
        message: message,
        signature: signature,
        nonce: nonce,
        timestamp: new Date().toISOString()
      });
      showSuccess('Signature Verification Successful', 'Message has been signed and verified', 3000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      showError('Signature Verification Failed', reason, 4000);
    } finally {
      setIsSigning(false);
    }
  };


  // Custom transaction (call contract function) with fee payer
  const signCustomTransaction = async () => {
    try {
      setError('');
      setIsSigning(true);
      // Clear previous states
      setSignatureInfo(null);
      setTransactionStatus(null);

      if (!account) {
        throw new Error('Please connect wallet first');
      }

      if (!sponsorAccount) {
        throw new Error('Sponsor account not initialized');
      }

      // Check if sponsor has sufficient balance
      const sponsorBalanceNum = parseInt(sponsorBalance);
      if (sponsorBalanceNum < 150000) {
        showError(
          'Sponsor Account Needs Funding',
          `The sponsor account (${sponsorAccount.accountAddress.toString().slice(0, 10)}...) needs APT to pay gas fees. Address: ${sponsorAccount.accountAddress.toString()}`,
          8000
        );
        throw new Error(`Sponsor account needs funding. Address: ${sponsorAccount.accountAddress.toString()}`);
      }

      // Filter empty generic parameters and function arguments
      const validGenericParams = customGenericParams.filter(param => param.trim() !== '');
      const validArguments = customArguments.filter(arg => arg.trim() !== '');

      showInfo('Building Transaction', 'Creating sponsored custom transaction...', 2000);

      // Build transaction with fee payer
      const transaction = await aptosClient.transaction.build.simple({
        sender: account.address,
        withFeePayer: true,
        data: {
          function: customFunction as `${string}::${string}::${string}`,
          typeArguments: validGenericParams as `${string}::${string}::${string}`[],
          functionArguments: validArguments
        },
        options: {
          maxGasAmount: parseInt(customMaxGas),
          gasUnitPrice: parseInt(customGasPrice),
        }
      });

      showInfo('Signing Transaction', 'Requesting signature from your wallet...', 2000);

      // User signs the transaction using wallet adapter
      const { authenticator: rawSenderAuthenticator } = await signTransaction({
        transactionOrPayload: transaction,
      });

      console.log('Custom tx - Raw sender authenticator:', rawSenderAuthenticator);

      // Convert authenticator to proper format for Aptos SDK
      const senderAuthenticator = convertAuthenticator(rawSenderAuthenticator);

      console.log('Custom tx - Converted sender authenticator:', senderAuthenticator);

      // Set signature info for custom transaction
      setSignatureInfo({
        type: 'custom_sign',
        authenticator: senderAuthenticator,
        rawTransaction: transaction,
        function: customFunction,
        typeArguments: validGenericParams,
        arguments: validArguments,
        maxGas: customMaxGas,
        gasPrice: customGasPrice,
        timestamp: new Date().toISOString()
      });

      showInfo('Sponsor Signing', 'Sponsor is signing as fee payer...', 2000);

      // Sponsor signs as fee payer
      const feePayerAuthenticator = aptosClient.transaction.signAsFeePayer({
        signer: sponsorAccount,
        transaction
      });

      console.log('Custom tx - Fee payer authenticator:', feePayerAuthenticator);

      showInfo('Submitting Transaction', 'Sending to blockchain...', 2000);

      // Submit with both authenticators
      const response = await aptosClient.transaction.submit.simple({
        transaction,
        senderAuthenticator,
        feePayerAuthenticator
      });

      const customData = {
        type: 'custom',
        hash: response.hash,
        function: customFunction,
        typeArguments: validGenericParams,
        arguments: validArguments,
        maxGas: customMaxGas,
        gasPrice: customGasPrice,
        timestamp: new Date().toISOString()
      };

      setLastTransaction(customData);
      setTransactionHistory(prev => [customData, ...prev]);
      setTransactionStatus({
        type: 'custom',
        hash: response.hash,
        function: customFunction,
        typeArguments: validGenericParams,
        arguments: validArguments,
        maxGas: customMaxGas,
        gasPrice: customGasPrice,
        status: 'submitted',
        timestamp: new Date().toISOString()
      });
      showSuccess('Custom Transaction Successful', `Hash: ${response.hash.slice(0, 20)}...${response.hash.slice(-8)}`, 4000);

      // Refresh balances after successful transaction
      setTimeout(() => {
        fetchBalance();
        fetchSponsorBalance(); // Refresh sponsor balance since it paid gas fees
      }, 2000);

      console.log(response)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      showError('Custom Transaction Failed', reason, 4000);
    } finally {
      setIsSigning(false);
    }
  };

  const renderWalletStatusCard = (extraClasses = '') => (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${extraClasses}`}>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Wallet Status</h2>

      {connected && wallet ? (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              {wallet.icon ? (
                <img
                  src={wallet.icon}
                  alt={wallet.name}
                  className="w-8 h-8 rounded"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                    if (nextElement) {
                      nextElement.style.display = 'block';
                    }
                  }}
                />
              ) : null}
              <span className="text-white font-bold" style={{ display: wallet.icon ? 'none' : 'block' }}>
                {wallet.name.charAt(0)}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{wallet.name}</p>
              <p className="text-sm text-gray-500">Connected</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Address</p>
            <div className="flex items-center space-x-2">
              <code className="text-sm font-mono text-gray-900 flex-1 truncate">
                {account?.address.toString()}
              </code>
              <button
                onClick={() => copyToClipboard(account?.address.toString() || '', 'Address')}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Network</p>
              <p className="truncate">{Object.values(APTOS_NETWORKS).find((network) => network.network === selectedAptosNetwork)?.name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-gray-500">Balance</p>
              <div className="flex items-center space-x-2">
                {isLoadingBalance ? (
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                    <span className="text-xs text-gray-400">Loading...</span>
                  </div>
                ) : (
                  <p className="font-mono text-sm">
                    {(parseFloat(balance) / 100000000).toFixed(4)} APT
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Faucet buttons */}
          {selectedAptosNetwork === Network.DEVNET && (
            <button
              onClick={handleDevnetFaucet}
              disabled={isFaucetLoading}
              className="w-full px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFaucetLoading ? 'Getting Tokens...' : 'Get 0.5 APT (Devnet)'}
            </button>
          )}

          {selectedAptosNetwork === Network.TESTNET && (
            <button
              onClick={handleTestnetFaucet}
              className="w-full px-4 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
            >
              Get Testnet APT
            </button>
          )}

          {/* Sponsor Account Info - Important for Solana wallets */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Gas Fee Sponsor</h4>
              <span className={`text-xs px-2 py-1 rounded ${parseInt(sponsorBalance) > 150000 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {parseInt(sponsorBalance) > 150000 ? 'Funded' : 'Needs Funding'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Solana wallets require a sponsor to pay gas fees
            </p>
            <div className="bg-gray-50 rounded p-2 mb-2">
              <p className="text-xs text-gray-500 mb-1">Sponsor Address</p>
              <div className="flex items-center space-x-2">
                <code className="text-xs font-mono text-gray-700 flex-1 truncate">
                  {sponsorAccount?.accountAddress.toString()}
                </code>
                <button
                  onClick={() => copyToClipboard(sponsorAccount?.accountAddress.toString() || '', 'Sponsor Address')}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Balance: {(parseFloat(sponsorBalance) / 100000000).toFixed(4)} APT
              </p>
            </div>

            {/* Sponsor Faucet buttons */}
            {parseInt(sponsorBalance) < 150000 && (
              <>
                {selectedAptosNetwork === Network.DEVNET && (
                  <button
                    onClick={handleSponsorDevnetFaucet}
                    disabled={isFaucetLoading}
                    className="w-full px-3 py-2 text-xs text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-2"
                  >
                    {isFaucetLoading ? 'Funding Sponsor...' : '⛽ Fund Sponsor (1 APT)'}
                  </button>
                )}
                {selectedAptosNetwork === Network.TESTNET && (
                  <button
                    onClick={handleSponsorTestnetFaucet}
                    className="w-full px-3 py-2 text-xs text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors mb-2"
                  >
                    ⛽ Fund Sponsor (Testnet)
                  </button>
                )}
              </>
            )}
          </div>

          <button
            onClick={handleWalletDisconnect}
            className="w-full px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-gray-500">No wallet connected</p>
          <p className="text-sm text-gray-400 mt-1">Connect a wallet to get started</p>
          {wallet?.url && (
            <div className="mt-2">
              <p className="text-xs text-gray-400">Wallet URL:</p>
              <code className="text-xs text-blue-600 break-all">{wallet.url}</code>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 break-words overflow-wrap-anywhere">{error}</p>
        </div>
      )}
    </div>
  );

  const getTransactionTypeLabel = (type: string) => {
    if (type === 'transfer_sign') return 'Transfer Sign';
    if (type === 'transfer_submit') return 'Transfer Submit';
    if (type === 'message') return 'Message Sign';
    if (type === 'sign_verify') return 'Sign & Verify';
    if (type === 'custom') return 'Custom Transaction';
    return 'Unknown';
  };

  const getTransactionTypeColor = (type: string) => {
    if (type === 'transfer_sign') return 'text-green-600';
    if (type === 'transfer_submit') return 'text-orange-600';
    if (type === 'message') return 'text-blue-600';
    if (type === 'sign_verify') return 'text-indigo-600';
    if (type === 'custom') return 'text-purple-600';
    return 'text-gray-600';
  };

  const getTransactionTypeBackground = (type: string) => {
    if (type === 'transfer_sign') return 'bg-green-500';
    if (type === 'transfer_submit') return 'bg-orange-500';
    if (type === 'message') return 'bg-blue-500';
    if (type === 'sign_verify') return 'bg-indigo-500';
    if (type === 'custom') return 'bg-purple-500';
    return 'bg-gray-500';
  };

  const renderTransactionHistoryCard = (extraClasses = '') => {
    if (!transactionHistory.length) {
      return null;
    }

    const historyItems = transactionHistory.slice(0, 5);

    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${extraClasses}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <button
            onClick={() => setTransactionHistory([])}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>

        <div className="hidden md:block">
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {historyItems.map((tx, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-sm font-medium ${getTransactionTypeColor(tx.type)}`}>
                    {getTransactionTypeLabel(tx.type)}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">
                      {new Date(tx.timestamp).toLocaleTimeString()}
                    </span>
                    <button
                      onClick={() => viewTransactionDetails(tx)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </div>
                </div>
                {tx.hash && (
                  <div className="flex items-center space-x-2 mb-1">
                    <p className="text-xs font-mono text-gray-600 truncate flex-1">
                      Hash: {tx.hash}
                    </p>
                    <button
                      onClick={() => copyToClipboard(tx.hash, 'Transaction Hash')}
                      className="text-gray-400 hover:text-gray-600"
                      title="Copy Hash"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                )}
                {tx.signature && (
                  <div className="flex items-center space-x-2 mb-1">
                    <p className="text-xs font-mono text-gray-600 truncate flex-1">
                      Signature: {JSON.stringify(tx.signature).slice(0, 30)}...
                    </p>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(tx.signature), 'Signature')}
                      className="text-gray-400 hover:text-gray-600"
                      title="Copy Signature"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                )}
                {tx.message && (
                  <p className="text-xs text-gray-600 truncate">
                    Message: {tx.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="md:hidden -mx-2 px-2">
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2">
            {historyItems.map((tx, index) => (
              <div key={index} className="min-w-[250px] max-w-[280px] snap-start border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className={`text-sm font-semibold ${getTransactionTypeColor(tx.type)}`}>{getTransactionTypeLabel(tx.type)}</p>
                    <p className="text-xs text-gray-400">{new Date(tx.timestamp).toLocaleTimeString()}</p>
                  </div>
                  <button
                    onClick={() => viewTransactionDetails(tx)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View
                  </button>
                </div>
                {tx.hash && (
                  <button
                    onClick={() => copyToClipboard(tx.hash, 'Transaction Hash')}
                    className="w-full text-left text-xs font-mono text-gray-600 truncate hover:text-gray-800"
                    title="Copy Hash"
                  >
                    Hash: {tx.hash}
                  </button>
                )}
                {tx.signature && (
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(tx.signature), 'Signature')}
                    className="mt-2 w-full text-left text-xs font-mono text-gray-600 truncate hover:text-gray-800"
                    title="Copy Signature"
                  >
                    Signature: {JSON.stringify(tx.signature).slice(0, 30)}...
                  </button>
                )}
                {tx.message && (
                  <p className="mt-2 text-xs text-gray-600 truncate">Message: {tx.message}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderSignaturePanel = (allowedTypes: SignatureInfo['type'][]) => {
    if (!signatureInfo || !allowedTypes.includes(signatureInfo.type)) {
      return null;
    }

    const meta = signatureMeta[signatureInfo.type];
    const theme = themeStyles[meta.theme];
    const timestampLabel = new Date(signatureInfo.timestamp).toLocaleTimeString();

    const renderCopyButton = (value: string, label: string) => (
      <button
        onClick={() => copyToClipboard(value, label)}
        className={`p-2 ${theme.button} rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center`}
        title={`Copy ${label}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    );

    const sections: ReactNode[] = [];

    if ('message' in signatureInfo) {
      sections.push(
        <div key="message">
          <label className={`text-xs font-medium ${theme.label}`}>Message:</label>
          <p className={`text-sm ${theme.text} break-words`}>{signatureInfo.message}</p>
        </div>
      );
    }

    if ('amount' in signatureInfo) {
      sections.push(
        <div key="amount" className="flex items-center justify-between">
          <span className={`text-sm font-medium ${theme.label}`}>Amount:</span>
          <span className={`text-sm ${theme.text}`}>{signatureInfo.amount} micro APT</span>
        </div>
      );
    }

    if ('recipient' in signatureInfo) {
      const recipientValue = signatureInfo.recipient;
      sections.push(
        <div key="recipient">
          <label className={`text-xs font-medium ${theme.label}`}>Recipient:</label>
          <div className="flex items-center space-x-2">
            <code className={`flex-1 text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}>
              {recipientValue}
            </code>
            {renderCopyButton(recipientValue, 'Recipient Address')}
          </div>
        </div>
      );
    }

    if ('signature' in signatureInfo && signatureInfo.signature) {
      const signatureString = safeStringify(signatureInfo.signature);
      sections.push(
        <div key="signature">
          <label className={`text-xs font-medium ${theme.label}`}>Signature:</label>
          <div className="flex items-center space-x-2">
            <code className={`flex-1 text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}>
              {truncate(signatureString)}
            </code>
            {renderCopyButton(signatureString, 'Signature')}
          </div>
        </div>
      );
    } else if ('authenticator' in signatureInfo && signatureInfo.authenticator) {
      const authenticatorString = safeStringify(signatureInfo.authenticator);
      sections.push(
        <div key="authenticator">
          <label className={`text-xs font-medium ${theme.label}`}>Authenticator:</label>
          <div className="flex items-center space-x-2">
            <code className={`flex-1 text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}>
              {truncate(authenticatorString)}
            </code>
            {renderCopyButton(authenticatorString, 'Authenticator')}
          </div>
        </div>
      );
    }

    if ('function' in signatureInfo && signatureInfo.function) {
      sections.push(
        <div key="function">
          <label className={`text-xs font-medium ${theme.label}`}>Function:</label>
          <code className={`block text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded mt-1`}>
            {signatureInfo.function}
          </code>
        </div>
      );
    }

    if ('typeArguments' in signatureInfo && signatureInfo.typeArguments.length) {
      sections.push(
        <div key="typeArguments">
          <label className={`text-xs font-medium ${theme.label}`}>Type Arguments:</label>
          <div className="space-y-1 mt-1">
            {signatureInfo.typeArguments.map((arg, index) => (
              <code
                key={`${arg}-${index}`}
                className={`block text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}
              >
                {arg}
              </code>
            ))}
          </div>
        </div>
      );
    }

    if ('arguments' in signatureInfo && signatureInfo.arguments.length) {
      sections.push(
        <div key="arguments">
          <label className={`text-xs font-medium ${theme.label}`}>Function Arguments:</label>
          <div className="space-y-1 mt-1">
            {signatureInfo.arguments.map((arg, index) => (
              <code
                key={`${arg}-${index}`}
                className={`block text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}
              >
                {arg}
              </code>
            ))}
          </div>
        </div>
      );
    }

    if ('maxGas' in signatureInfo) {
      sections.push(
        <div key="maxGas" className="flex items-center justify-between">
          <span className={`text-sm font-medium ${theme.label}`}>Max Gas:</span>
          <span className={`text-sm ${theme.text}`}>{signatureInfo.maxGas}</span>
        </div>
      );
    }

    if ('gasPrice' in signatureInfo) {
      sections.push(
        <div key="gasPrice" className="flex items-center justify-between">
          <span className={`text-sm font-medium ${theme.label}`}>Gas Price:</span>
          <span className={`text-sm ${theme.text}`}>{signatureInfo.gasPrice}</span>
        </div>
      );
    }

    if ('nonce' in signatureInfo) {
      sections.push(
        <div key="nonce">
          <label className={`text-xs font-medium ${theme.label}`}>Nonce:</label>
          <div className="flex items-center space-x-2">
            <code className={`flex-1 text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}>
              {signatureInfo.nonce}
            </code>
            {renderCopyButton(signatureInfo.nonce, 'Nonce')}
          </div>
        </div>
      );
    }

    return (
      <div className={`mt-4 p-4 rounded-lg ${theme.container}`}>
        <div className="flex items-center justify-between mb-3">
          <h4 className={`text-sm font-semibold flex items-center ${theme.heading}`}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {meta.title}
          </h4>
          <span className={`text-xs ${theme.pill} px-2 py-1 rounded-full`}>{timestampLabel}</span>
        </div>
        <div className="space-y-2">{sections}</div>
      </div>
    );
  };

  const renderTransactionStatusPanel = (allowedTypes: TransactionStatusInfo['type'][]) => {
    if (!transactionStatus || !allowedTypes.includes(transactionStatus.type)) {
      return null;
    }

    const meta = transactionStatusMeta[transactionStatus.type];
    const theme = themeStyles[meta.theme];
    const timestampLabel = new Date(transactionStatus.timestamp).toLocaleTimeString();
    const statusLabel = transactionStatus.status === 'submitted' ? 'Submitted' : transactionStatus.status;

    const renderCopyButton = (value: string, label: string) => (
      <button
        onClick={() => copyToClipboard(value, label)}
        className={`p-2 ${theme.button} rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center`}
        title={`Copy ${label}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    );

    const renderExplorerButton = (hash: string) => (
      <button
        onClick={() => window.open(getExplorerUrl(hash), '_blank')}
        className={`p-2 ${theme.button} rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center`}
        title="View in Explorer"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </button>
    );

    const sections: ReactNode[] = [
      <div key="status" className="flex items-center justify-between">
        <span className={`text-sm font-medium ${theme.label}`}>Status:</span>
        <span className={`text-sm font-semibold ${theme.pill} px-2 py-1 rounded-full`}>{statusLabel}</span>
      </div>
    ];

    const hashValue = transactionStatus.hash;
    sections.push(
      <div key="hash">
        <label className={`text-xs font-medium ${theme.label}`}>Transaction Hash:</label>
        <div className="flex items-center space-x-2">
          <code className={`flex-1 text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}>
            {hashValue}
          </code>
          {renderCopyButton(hashValue, 'Transaction Hash')}
          {renderExplorerButton(hashValue)}
        </div>
      </div>
    );

    if ('recipient' in transactionStatus) {
      const recipientValue = transactionStatus.recipient;
      sections.push(
        <div key="recipient">
          <label className={`text-xs font-medium ${theme.label}`}>Recipient:</label>
          <div className="flex items-center space-x-2">
            <code className={`flex-1 text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}>
              {recipientValue}
            </code>
            {renderCopyButton(recipientValue, 'Recipient Address')}
          </div>
        </div>
      );
    }

    if ('amount' in transactionStatus) {
      sections.push(
        <div key="amount">
          <label className={`text-xs font-medium ${theme.label}`}>Amount:</label>
          <div className="flex items-center space-x-2">
            <code className={`flex-1 text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}>
              {transactionStatus.amount} micro APT
            </code>
            {renderCopyButton(transactionStatus.amount, 'Amount')}
          </div>
        </div>
      );
    }

    if ('function' in transactionStatus && transactionStatus.function) {
      sections.push(
        <div key="function">
          <label className={`text-xs font-medium ${theme.label}`}>Function:</label>
          <code className={`block text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded mt-1`}>
            {transactionStatus.function}
          </code>
        </div>
      );
    }

    if ('typeArguments' in transactionStatus && transactionStatus.typeArguments.length) {
      sections.push(
        <div key="typeArguments">
          <label className={`text-xs font-medium ${theme.label}`}>Type Arguments:</label>
          <div className="space-y-1 mt-1">
            {transactionStatus.typeArguments.map((arg, index) => (
              <code
                key={`${arg}-${index}`}
                className={`block text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}
              >
                {arg}
              </code>
            ))}
          </div>
        </div>
      );
    }

    if ('arguments' in transactionStatus && transactionStatus.arguments.length) {
      sections.push(
        <div key="arguments">
          <label className={`text-xs font-medium ${theme.label}`}>Function Arguments:</label>
          <div className="space-y-1 mt-1">
            {transactionStatus.arguments.map((arg, index) => (
              <code
                key={`${arg}-${index}`}
                className={`block text-xs ${theme.text} break-all ${theme.codeBg} p-2 rounded`}
              >
                {arg}
              </code>
            ))}
          </div>
        </div>
      );
    }

    if ('maxGas' in transactionStatus) {
      sections.push(
        <div key="maxGas" className="flex items-center justify-between">
          <span className={`text-sm font-medium ${theme.label}`}>Max Gas:</span>
          <span className={`text-sm ${theme.text}`}>{transactionStatus.maxGas}</span>
        </div>
      );
    }

    if ('gasPrice' in transactionStatus) {
      sections.push(
        <div key="gasPrice" className="flex items-center justify-between">
          <span className={`text-sm font-medium ${theme.label}`}>Gas Price:</span>
          <span className={`text-sm ${theme.text}`}>{transactionStatus.gasPrice}</span>
        </div>
      );
    }

    return (
      <div className={`mt-4 p-4 rounded-lg ${theme.container}`}>
        <div className="flex items-center justify-between mb-3">
          <h4 className={`text-sm font-semibold flex items-center ${theme.heading}`}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {meta.title}
          </h4>
          <span className={`text-xs ${theme.pill} px-2 py-1 rounded-full`}>{timestampLabel}</span>
        </div>
        <div className="space-y-2">{sections}</div>
      </div>
    );
  };

  const renderSignMessageCard = (extraClasses = '') => (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${extraClasses}`}>
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <span className="text-blue-600 font-bold text-sm">1</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sign Message</h2>
          <p className="text-sm text-gray-500">Sign an arbitrary message for authentication</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Message to Sign</label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            placeholder="Enter message to sign..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={signMessageAction}
            disabled={!account || isSigning}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSigning ? 'Signing...' : 'Sign Message'}
          </button>

          <button
            onClick={signMessageAndVerifyAction}
            disabled={!account || isSigning}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSigning ? 'Signing...' : 'Sign & Verify'}
          </button>
        </div>
      </div>

      {renderSignaturePanel(['message', 'sign_verify'])}

      <div className="mt-4 rounded-lg overflow-hidden border border-gray-200">
        <SyntaxHighlighter
          language="typescript"
          style={tomorrow}
          customStyle={{
            margin: 0,
            fontSize: '14px',
            lineHeight: '1.5',
          }}
          showLineNumbers={false}
        >
{`const signature = await signMessage({
  message: message,
  nonce: crypto.randomUUID().replaceAll("-", ""),
});`}
        </SyntaxHighlighter>
      </div>
    </div>
  );

  const renderSignTransactionCard = (extraClasses = '') => (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${extraClasses}`}>
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
          <span className="text-green-600 font-bold text-sm">2</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sign Transaction</h2>
          <p className="text-sm text-gray-500">Sign a transaction without submitting to the network</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Address</label>
            <input
              value={transferRecipient}
              onChange={(e) => setTransferRecipient(e.target.value)}
              placeholder="0x1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount (micro APT)</label>
            <input
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="1000"
              type="number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={signTransferTransaction}
            disabled={!account || isSigning}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSigning ? 'Signing...' : 'Sign Transaction'}
          </button>

          <button
            onClick={submitTransferTransaction}
            disabled={!account || isSigning}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSigning ? 'Submitting...' : 'Sign And Submit Transaction'}
          </button>
        </div>
      </div>

      {renderSignaturePanel(['transfer_sign'])}
      {renderTransactionStatusPanel(['transfer_submit'])}

      <div className="mt-4 rounded-lg overflow-hidden border border-gray-200">
        <SyntaxHighlighter
          language="typescript"
          style={tomorrow}
          customStyle={{
            margin: 0,
            fontSize: '14px',
            lineHeight: '1.5',
          }}
          showLineNumbers={false}
        >
{`const { authenticator, rawTransaction } = await signTransaction({
  transactionOrPayload: {
    data: {
      function: "0x1::aptos_account::transfer",
      functionArguments: [recipient, amount]
    },
    options: { maxGasAmount: 1500, gasUnitPrice: 100 }
  }
});

// For submission:
const response = await aptosClient.transaction.submit.simple({
  transaction: SimpleTransaction.deserialize(new Deserializer(rawTransaction)),
  senderAuthenticator: authenticator
});`}
        </SyntaxHighlighter>
      </div>
    </div>
  );

  const renderCustomTransactionCard = (extraClasses = '') => (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${extraClasses}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <span className="text-purple-600 font-bold text-sm">3</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Custom Transaction</h2>
            <p className="text-sm text-gray-500">Call any entry function with custom parameters</p>
          </div>
        </div>
        <button
          onClick={resetCustomTransaction}
          className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100"
        >
          Reset
        </button>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Function (module::resource::method)</label>
            <input
              value={customFunction}
              onChange={(e) => setCustomFunction(e.target.value)}
              placeholder="0x1::coin::transfer"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Gas Amount</label>
            <input
              value={customMaxGas}
              onChange={(e) => setCustomMaxGas(e.target.value)}
              type="number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gas Unit Price</label>
            <input
              value={customGasPrice}
              onChange={(e) => setCustomGasPrice(e.target.value)}
              type="number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Type Arguments</label>
            <button
              type="button"
              onClick={addCustomGenericParam}
              className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 transition-all hover:bg-purple-100 active:scale-[0.98] shadow-sm shadow-purple-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add type argument
            </button>
          </div>

          <div className="space-y-2">
            {customGenericParams.map((param, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={param}
                  onChange={(e) => updateCustomGenericParam(index, e.target.value)}
                  placeholder="0x1::aptos_coin::AptosCoin"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                {customGenericParams.length > 1 && (
                  <button
                    onClick={() => removeCustomGenericParam(index)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Function Arguments</label>
            <button
              type="button"
              onClick={addCustomArgument}
              className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 transition-all hover:bg-purple-100 active:scale-[0.98] shadow-sm shadow-purple-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add argument
            </button>
          </div>

          <div className="space-y-2">
            {customArguments.map((arg, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={arg}
                  onChange={(e) => updateCustomArgument(index, e.target.value)}
                  placeholder={index === 0 ? '0x1' : '1000'}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                {customArguments.length > 1 && (
                  <button
                    onClick={() => removeCustomArgument(index)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={signCustomTransaction}
          disabled={!account || isSigning}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSigning ? 'Processing...' : 'Sign & Submit Custom Transaction'}
        </button>
      </div>

      {renderSignaturePanel(['custom_sign'])}
      {renderTransactionStatusPanel(['custom'])}

      <div className="mt-4 rounded-lg overflow-hidden border border-gray-200">
        <SyntaxHighlighter
          language="typescript"
          style={tomorrow}
          customStyle={{
            margin: 0,
            fontSize: '14px',
            lineHeight: '1.5',
          }}
          showLineNumbers={false}
        >
{`const { authenticator, rawTransaction } = await signTransaction({
  transactionOrPayload: {
    data: {
      function: customFunction,
      typeArguments: validGenericParams,
      functionArguments: validArguments
    },
    options: {
      maxGasAmount: parseInt(customMaxGas),
      gasUnitPrice: parseInt(customGasPrice)
    }
  }
});

const response = await aptosClient.transaction.submit.simple({
  transaction: SimpleTransaction.deserialize(new Deserializer(rawTransaction)),
  senderAuthenticator: authenticator
});`}
        </SyntaxHighlighter>
      </div>
    </div>
  );

  const renderNetworkSwitcher = (className = '') => (
    <select
      value={currentNetworkKey}
      onChange={(e) => switchAptosNetwork(e.target.value as AptosNetworkType)}
      className={`px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${className}`}
    >
      {Object.entries(APTOS_NETWORKS).map(([key, network]) => (
        <option key={key} value={key}>
          {network.name}
        </option>
      ))}
    </select>
  );

  const renderConnectWalletButton = (className = '') => (
    <button
      onClick={() => setShowWalletPopup(true)}
      className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
        connected
          ? 'bg-green-100 text-green-800 border border-green-200'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      } ${className}`}
    >
      {connected && wallet ? (
        <>
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="font-semibold">{wallet.name}</span>
          <span className="text-xs opacity-80 font-mono">{formatAddress(account?.address.toString() || '')}</span>
        </>
      ) : (
        'Connect Wallet'
      )}
    </button>
  );

  const renderLastActionBanner = (extraClasses = '') => {
    if (!lastTransaction) {
      return null;
    }

    const label = getTransactionTypeLabel(lastTransaction.type);
    const background = getTransactionTypeBackground(lastTransaction.type);
    const timestamp = new Date(lastTransaction.timestamp).toLocaleTimeString();

    return (
      <div className={`rounded-2xl border border-gray-200 bg-white/70 backdrop-blur shadow-sm p-4 flex items-center gap-4 ${extraClasses}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold capitalize ${background}`}>
          {label.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{label}</p>
          <p className="text-xs text-gray-500 truncate">{timestamp}</p>
          {lastTransaction.hash && (
            <button
              onClick={() => copyToClipboard(lastTransaction.hash, 'Transaction Hash')}
              className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {formatAddress(lastTransaction.hash)}
            </button>
          )}
          {lastTransaction.recipient && (
            <p className="mt-1 text-xs text-gray-500 truncate">To {formatAddress(lastTransaction.recipient)}</p>
          )}
          {lastTransaction.message && (
            <p className="mt-1 text-xs text-gray-500 truncate">“{lastTransaction.message}”</p>
          )}
        </div>
        <button
          onClick={() => viewTransactionDetails(lastTransaction)}
          className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
        >
          Details
        </button>
      </div>
    );
  };

  const renderMobileHeroSection = () => (
    <section className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-6 text-white shadow-xl shadow-indigo-400/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm text-lg font-semibold">
            APT
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-white/70">Wallet sandbox</p>
            <h2 className="text-2xl font-semibold leading-snug">Chain × ETH Playground</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-white/80">
          Exercise the full workflow—connect a wallet, sign messages, and submit Move calls—with a layout tuned for phones.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3">
          {renderConnectWalletButton('w-full h-12 text-base font-semibold shadow-lg shadow-blue-900/40')}
          {renderNetworkSwitcher('w-full h-11 rounded-2xl border-0 bg-white/90 text-indigo-700 font-medium shadow-inner shadow-blue-900/15 focus:ring-blue-500 focus:ring-offset-0')}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/80">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-lime-200 animate-pulse' : 'bg-white/50'}`} />
            {connected && account ? formatAddress(account.address.toString()) : 'Wallet ready'}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-sky-300" />
            {currentNetworkLabel}
          </span>
        </div>
      </div>
    </section>
  );

  const renderMobileActionControls = () => (
    <section className="space-y-5">
      <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-2 pt-1 -mx-1 px-1">
        {mobileActionTabs.map((tab) => {
          const isActive = activeMobileAction === tab.id;
          return (
            <div
              key={tab.id}
              className={`snap-start min-w-[220px] rounded-[28px] p-[1px] transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shadow-lg shadow-blue-200/60'
                  : 'bg-white/50 border border-white/60'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveMobileAction(tab.id)}
                aria-pressed={isActive}
                className={`w-full h-full rounded-[26px] px-5 py-4 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-lg'
                    : 'bg-white/80 text-slate-600 backdrop-blur'
                }`}
              >
                <span className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Example {tab.step}</span>
                <span className="mt-2 block text-base font-semibold">{tab.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">{tab.description}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="space-y-5">
        {activeMobileAction === 'sign-message' && renderSignMessageCard('mobile-glass-card shadow-blue-100/40')}
        {activeMobileAction === 'sign-transaction' && renderSignTransactionCard('mobile-glass-card shadow-green-100/40')}
        {activeMobileAction === 'custom-transaction' && renderCustomTransactionCard('mobile-glass-card shadow-purple-100/40')}
      </div>
    </section>
  );

  const renderDesktopLayout = () => (
    <div className="hidden lg:grid lg:grid-cols-3 gap-8">
      <div className="space-y-6">
        {renderWalletStatusCard()}
        {renderTransactionHistoryCard()}
      </div>
      <div className="lg:col-span-2 space-y-6">
        {renderLastActionBanner('hidden lg:flex')}
        {renderSignMessageCard()}
        {renderSignTransactionCard()}
        {renderCustomTransactionCard()}
      </div>
    </div>
  );


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <header className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-sm md:text-base">
                A
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-semibold text-gray-900">Aptos Wallet Demo</h1>
                <p className="text-xs text-gray-500 md:text-sm md:text-gray-400">Chain × ETH friendly signer</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3">
              {renderNetworkSwitcher()}
              {renderConnectWalletButton()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-8">
        <div className="md:hidden space-y-6">
          {renderMobileHeroSection()}
          {renderLastActionBanner('mobile-glass-card')}
          <div className="space-y-4">
            {renderWalletStatusCard('mobile-glass-card')}
            {renderTransactionHistoryCard('mobile-glass-card')}
          </div>
          {renderMobileActionControls()}
        </div>

        {renderDesktopLayout()}
      </main>

      <WalletPopup
        wallets={wallets as any}
        notDetectedWallets={notDetectedWallets as any}
        isOpen={showWalletPopup}
        onClose={() => setShowWalletPopup(false)}
        onWalletConnect={handleWalletConnect}
      />

      {/* Transaction Details Modal */}
      {showTransactionModal && selectedTransaction && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowTransactionModal(false)}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden border border-gray-200/50"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200/60 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Transaction Details</h2>
                  <p className="text-sm text-gray-500">View transaction information and data</p>
                </div>
              </div>
              <button
                onClick={() => setShowTransactionModal(false)}
                className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-all duration-200 flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh] bg-gray-50/30">
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-4 border border-gray-200/60 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span>Transaction Type</span>
                    </label>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      {new Date(selectedTransaction.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                      selectedTransaction.type === 'transfer_sign' ? 'bg-green-100 text-green-800 border border-green-200' : 
                      selectedTransaction.type === 'transfer_submit' ? 'bg-orange-100 text-orange-800 border border-orange-200' : 
                      selectedTransaction.type === 'message' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 
                      selectedTransaction.type === 'sign_verify' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 
                      selectedTransaction.type === 'custom' ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-gray-100 text-gray-800 border border-gray-200'
                    }`}>
                      {selectedTransaction.type === 'transfer_sign' ? 'Transfer Sign' : 
                       selectedTransaction.type === 'transfer_submit' ? 'Transfer Submit' : 
                       selectedTransaction.type === 'message' ? 'Message Sign' : 
                       selectedTransaction.type === 'sign_verify' ? 'Sign & Verify' : 
                       selectedTransaction.type === 'custom' ? 'Custom Transaction' : 'Unknown'}
                    </span>
                  </div>
                </div>

                {selectedTransaction.hash && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200/60 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>Transaction Hash</span>
                      </label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <code className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono break-all text-gray-800">
                        {selectedTransaction.hash}
                      </code>
                      <button
                        onClick={() => copyToClipboard(selectedTransaction.hash, 'Transaction Hash')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                )}

                {selectedTransaction.signature && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200/60 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        <span>Signature</span>
                      </label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <code className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono break-all max-h-32 overflow-y-auto text-gray-800">
                        {JSON.stringify(selectedTransaction.signature, null, 2)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(selectedTransaction.signature), 'Signature')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                )}

                {selectedTransaction.message && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200/60 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                        <span>Message</span>
                      </label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <code className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm break-all text-gray-800">
                        {selectedTransaction.message}
                      </code>
                      <button
                        onClick={() => copyToClipboard(selectedTransaction.message, 'Message')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                )}

                {selectedTransaction.nonce && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nonce</label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">
                        {selectedTransaction.nonce}
                      </code>
                      <button
                        onClick={() => copyToClipboard(selectedTransaction.nonce, 'Nonce')}
                        className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {selectedTransaction.amount && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <code className="p-2 bg-gray-100 rounded text-sm">
                      {selectedTransaction.amount} micro APT
                    </code>
                  </div>
                )}

                {selectedTransaction.recipient && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">
                        {selectedTransaction.recipient}
                      </code>
                      <button
                        onClick={() => copyToClipboard(selectedTransaction.recipient, 'Recipient Address')}
                        className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {selectedTransaction.typeArguments && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type Arguments</label>
                    <div className="space-y-2">
                      {selectedTransaction.typeArguments.map((arg: string, index: number) => (
                        <div key={index} className="flex items-center space-x-2">
                          <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">
                            {arg}
                          </code>
                          <button
                            onClick={() => copyToClipboard(arg, 'Type Argument')}
                            className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTransaction.arguments && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Function Arguments</label>
                    <div className="space-y-2">
                      {selectedTransaction.arguments.map((arg: string, index: number) => (
                        <div key={index} className="flex items-center space-x-2">
                          <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">
                            {arg}
                          </code>
                          <button
                            onClick={() => copyToClipboard(arg, 'Function Argument')}
                            className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTransaction.maxGas && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Gas</label>
                    <code className="p-2 bg-gray-100 rounded text-sm">
                      {selectedTransaction.maxGas}
                    </code>
                  </div>
                )}

                {selectedTransaction.gasPrice && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gas Price</label>
                    <code className="p-2 bg-gray-100 rounded text-sm">
                      {selectedTransaction.gasPrice}
                    </code>
                  </div>
                )}

                <div className="bg-white rounded-xl p-4 border border-gray-200/60 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                      <span>Raw Data</span>
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <code className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono break-all max-h-32 overflow-y-auto text-gray-800">
                      {JSON.stringify(selectedTransaction, null, 2)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedTransaction, null, 2), 'Raw Data')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy All</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  );
}

export default App;
