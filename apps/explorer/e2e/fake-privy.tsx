// Stand-in for @privy-io/react-auth, aliased in by next.config.ts when E2E_MODE=mock.
// Exports only what the app and @privy-io/wagmi import. Real Privy runs via `test:e2e:real`.
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type Hex, numberToHex, verifyMessage } from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";

// Real Privy's PRIVY_CONFIG.defaultChain is mainnet.
const DEFAULT_CHAIN_ID = 314;

type Listener = (...args: unknown[]) => void;

type SentTransaction = Record<string, unknown> & { hash: Hex };

/** Every transaction approved in the fake dialog, readable from Playwright as `window.__fakePrivyTransactions`. */
function sentTransactions(): SentTransaction[] {
  const w = window as typeof window & { __fakePrivyTransactions?: SentTransaction[] };
  w.__fakePrivyTransactions ??= [];
  return w.__fakePrivyTransactions;
}

type PendingSend = { tx: Record<string, unknown>; resolve: (hash: Hex) => void; reject: (error: unknown) => void };
type PendingSignature = {
  sign: () => Promise<Hex>;
  resolve: (signature: Hex) => void;
  reject: (error: unknown) => void;
};
type PendingFund = { address: string; reject: (error: unknown) => void };

// The provider lives outside React, so a send reaches the dialog in PrivyProvider through a window event.
function requestSend(tx: Record<string, unknown>): Promise<Hex> {
  return new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent<PendingSend>("fake-privy:send", { detail: { tx, resolve, reject } }));
  });
}

// The extension's signature popup lives outside React too, so it reaches PrivyProvider the same way.
function requestSignature(sign: () => Promise<Hex>): Promise<Hex> {
  return new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent<PendingSignature>("fake-privy:sign", { detail: { sign, resolve, reject } }));
  });
}

// An extension passes `prompt` to show its popup before each signature; the embedded wallet signs directly.
function createProvider(
  currentAccount: () => PrivateKeyAccount,
  prompt: (sign: () => Promise<Hex>) => Promise<Hex> = (sign) => sign(),
) {
  let chainId = DEFAULT_CHAIN_ID;
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };
  const switchChain = (id: number) => {
    chainId = id;
    emit("chainChanged", numberToHex(id));
  };
  const request = async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [currentAccount().address];
      case "eth_chainId":
        return numberToHex(chainId);
      case "wallet_switchEthereumChain":
        return switchChain(Number((params[0] as { chainId: Hex }).chainId));
      case "personal_sign": {
        const [message, address] = params as [Hex, string | undefined];
        const account = currentAccount();
        // A wallet signs only as an account connected to the site, and this fake connects one at a time.
        if (address && address.toLowerCase() !== account.address.toLowerCase()) {
          throw Object.assign(new Error("The requested account is not connected to this site."), { code: 4100 });
        }
        return prompt(() => account.signMessage({ message: { raw: message } }));
      }
      case "eth_signTypedData_v4":
        return currentAccount().signTypedData(JSON.parse(params[1] as string));
      // Goes through the fake Privy transaction dialog; nothing is signed or broadcast.
      case "eth_sendTransaction":
        return requestSend(params[0] as Record<string, unknown>);
      default:
        throw Object.assign(new Error(`fake Privy wallet does not support ${method}`), { code: 4200 });
    }
  };
  return {
    provider: {
      request,
      on: (event: string, listener: Listener) =>
        listeners.set(event, (listeners.get(event) ?? new Set()).add(listener)),
      removeListener: (event: string, listener: Listener) => listeners.get(event)?.delete(listener),
    },
    switchChain: async (id: number) => switchChain(id),
    chainId: () => `eip155:${chainId}`,
    emit,
  };
}

function createEmbeddedWallet(): Wallet {
  const account = privateKeyToAccount(generatePrivateKey());
  const wallet = createProvider(() => account);
  return {
    address: account.address,
    walletClientType: "privy",
    connectorType: "embedded",
    get chainId() {
      return wallet.chainId();
    },
    meta: { id: "io.privy.wallet", name: "Privy Wallet", icon: undefined },
    getEthereumProvider: async () => wallet.provider,
    switchChain: wallet.switchChain,
  };
}

// An extension like MetaMask: the site sees one selected account, which a test switches with the
// "fake-privy:switch-account" window event.
function createExtension(disconnect: () => void) {
  const accounts = [privateKeyToAccount(generatePrivateKey()), privateKeyToAccount(generatePrivateKey())];
  let selected = 0;
  const wallet = createProvider(() => accounts[selected], requestSignature);
  const current = (): Wallet => ({
    address: accounts[selected].address,
    walletClientType: "metamask",
    connectorType: "injected",
    get chainId() {
      return wallet.chainId();
    },
    meta: { id: "io.metamask", name: "MetaMask", icon: undefined },
    getEthereumProvider: async () => wallet.provider,
    switchChain: wallet.switchChain,
    disconnect,
  });
  const switchAccount = () => {
    selected = 1 - selected;
    wallet.emit("accountsChanged", [accounts[selected].address]);
    return current();
  };
  // Like revoking the site's access in MetaMask: the provider reports no accounts.
  const revoke = () => wallet.emit("accountsChanged", []);
  return { current, revoke, switchAccount };
}

type Wallet = {
  address: Hex;
  walletClientType: string;
  connectorType: string;
  readonly chainId: string;
  meta: { id: string; name: string; icon: undefined };
  getEthereumProvider: () => Promise<ReturnType<typeof createProvider>["provider"]>;
  switchChain: (id: number) => Promise<void>;
  disconnect?: () => void;
};
type User = { id: string; wallet?: { address: string; walletClientType: string }; linkedAccounts: object[] };
type LoginComplete = (event: { user: User; isNewUser: boolean; loginAccount: { type: string } }) => void;
type ConnectSuccess = (event: { wallet: Wallet }) => void;

type FakePrivy = {
  user: User | null;
  wallets: Wallet[];
  openLogin: () => void;
  logout: () => Promise<void>;
  onLogin: Set<LoginComplete>;
  connectWallet: () => void;
  onConnect: Set<ConnectSuccess>;
  loginWithWallet: (address: string, walletClientType: string) => void;
  fund: (address: string) => Promise<never>;
};

const FakePrivyContext = createContext<FakePrivy | null>(null);

function useFakePrivy(): FakePrivy {
  const value = useContext(FakePrivyContext);
  if (!value) throw new Error("fake Privy hook used outside PrivyProvider");
  return value;
}

function LoginModal({ onDone, onClose }: { onDone: (email: string) => void; onClose: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const setDigit = (i: number, digit: string) => {
    const next = code.with(i, digit);
    setCode(next);
    if (email && next.every(Boolean)) onDone(email);
  };
  return (
    <div role='dialog' aria-label='log in or sign up' id='privy-dialog'>
      <button type='button' aria-label='close modal' onClick={onClose} />
      {email === null ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setEmail(String(new FormData(event.currentTarget).get("email")));
          }}
        >
          <input name='email' type='email' placeholder='your@email.com' />
          <button type='submit'>Submit</button>
        </form>
      ) : (
        <>
          <h3>Enter confirmation code</h3>
          {code.map((digit, i) => (
            <input key={i} value={digit} maxLength={1} onChange={(event) => setDigit(i, event.target.value)} />
          ))}
        </>
      )}
    </div>
  );
}

// Real Privy's embedded-wallet flow on Filecoin: approve, then "Loading..." while it waits for the receipt,
// then "Transaction complete" whose All Done button is what hands the hash back. Closing the dialog before
// approving rejects; closing it after leaves the request unsettled, as the real dialog does.
function TransactionModal({ pending, onClose }: { pending: PendingSend; onClose: () => void }) {
  const [phase, setPhase] = useState<"approve" | "loading" | "complete">("approve");
  const [hash, setHash] = useState<Hex | null>(null);
  const approve = () => {
    const sent = sentTransactions();
    const txHash = numberToHex(sent.length + 1, { size: 32 });
    sent.push({ ...pending.tx, hash: txHash });
    setHash(txHash);
    setPhase("loading");
    setTimeout(() => setPhase("complete"), 1_500);
  };
  const close = () => {
    if (phase === "approve") pending.reject(Object.assign(new Error("User rejected the request."), { code: 4001 }));
    onClose();
  };
  return (
    <div role='dialog' aria-label='approve transaction' id='privy-dialog'>
      <button type='button' aria-label='close modal' onClick={close}>
        ✕
      </button>
      {phase === "approve" && (
        <>
          <h3>Approve transaction</h3>
          <button type='button' onClick={approve}>
            Approve
          </button>
        </>
      )}
      {phase === "loading" && <p>Loading...</p>}
      {phase === "complete" && hash && (
        <>
          <h3>Transaction complete! You're all set.</h3>
          <button
            type='button'
            onClick={() => {
              pending.resolve(hash);
              onClose();
            }}
          >
            All Done
          </button>
        </>
      )}
    </div>
  );
}

// Stands in for the extension's popup: Sign signs with the selected account, Reject rejects as MetaMask does.
function SignatureModal({ pending, onClose }: { pending: PendingSignature; onClose: () => void }) {
  return (
    <div role='dialog' aria-label='signature request' id='privy-dialog'>
      <h3>Signature request</h3>
      <button
        type='button'
        onClick={async () => {
          pending.resolve(await pending.sign());
          onClose();
        }}
      >
        Sign
      </button>
      <button
        type='button'
        onClick={() => {
          pending.reject(Object.assign(new Error("User rejected the request."), { code: 4001 }));
          onClose();
        }}
      >
        Reject
      </button>
    </div>
  );
}

// Privy's card purchase: it shows where the USDC goes, and closing it rejects with "User exited flow" as Privy does.
function FundModal({ pending, onClose }: { pending: PendingFund; onClose: () => void }) {
  return (
    <div role='dialog' aria-label='buy usdc' id='privy-dialog'>
      <button
        type='button'
        aria-label='close modal'
        onClick={() => {
          pending.reject(new Error("User exited flow"));
          onClose();
        }}
      >
        ✕
      </button>
      <h3>Buy USDC</h3>
      <p>Destination: {pending.address}</p>
    </div>
  );
}

// Like real Privy: portaled to <body> above the console's own modal dialogs, which make the page behind them inert.
const overlay = (dialog: ReactNode) =>
  createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483647, pointerEvents: "auto" }}>{dialog}</div>,
    document.body,
  );

export function PrivyProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [onLogin] = useState(() => new Set<LoginComplete>());
  const [onConnect] = useState(() => new Set<ConnectSuccess>());
  const [extension] = useState(() =>
    createExtension(() => setWallets((current) => current.filter((wallet) => wallet.connectorType !== "injected"))),
  );
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [pendingSignature, setPendingSignature] = useState<PendingSignature | null>(null);
  const [pendingFund, setPendingFund] = useState<PendingFund | null>(null);
  useEffect(() => {
    const onSend = (event: Event) => setPendingSend((event as CustomEvent<PendingSend>).detail);
    window.addEventListener("fake-privy:send", onSend);
    return () => window.removeEventListener("fake-privy:send", onSend);
  }, []);
  useEffect(() => {
    const onSign = (event: Event) => setPendingSignature((event as CustomEvent<PendingSignature>).detail);
    window.addEventListener("fake-privy:sign", onSign);
    return () => window.removeEventListener("fake-privy:sign", onSign);
  }, []);
  useEffect(() => {
    // Like MetaMask, the provider announces the new account and Privy then replaces the extension's wallet.
    const onSwitch = () => {
      const switched = extension.switchAccount();
      setWallets((current) => current.map((wallet) => (wallet.connectorType === "injected" ? switched : wallet)));
    };
    window.addEventListener("fake-privy:switch-account", onSwitch);
    return () => window.removeEventListener("fake-privy:switch-account", onSwitch);
  }, [extension]);
  useEffect(() => {
    // With no accounts left, Privy drops the extension's wallet.
    const onRevoke = () => {
      extension.revoke();
      setWallets((current) => current.filter((wallet) => wallet.connectorType !== "injected"));
    };
    window.addEventListener("fake-privy:revoke-extension", onRevoke);
    return () => window.removeEventListener("fake-privy:revoke-extension", onRevoke);
  }, [extension]);
  useEffect(() => {
    // Connects the extension from outside the app's own buttons, as Privy's wallet list or a pay-with flow would.
    const onConnectExtension = () => {
      const wallet = extension.current();
      setWallets((current) => [...current.filter((candidate) => candidate.connectorType !== "injected"), wallet]);
      for (const listener of onConnect) listener({ wallet });
    };
    window.addEventListener("fake-privy:connect-extension", onConnectExtension);
    return () => window.removeEventListener("fake-privy:connect-extension", onConnectExtension);
  }, [extension, onConnect]);

  const completeLogin = (email: string) => {
    setModalOpen(false);
    const emailAccount = { type: "email", address: email };
    const newUser: User = { id: `did:privy:fake-${email}`, linkedAccounts: [emailAccount] };
    setUser(newUser);
    for (const listener of onLogin) listener({ user: newUser, isNewUser: true, loginAccount: emailAccount });
    // createOnLogin: "users-without-wallets" provisions the embedded wallet after the user exists.
    setTimeout(() => {
      const wallet = createEmbeddedWallet();
      const walletAccount = { type: "wallet", address: wallet.address, walletClientType: "privy" };
      setUser({ ...newUser, wallet: walletAccount, linkedAccounts: [emailAccount, walletAccount] });
      setWallets([wallet]);
    });
  };

  const value: FakePrivy = {
    user,
    wallets,
    onLogin,
    openLogin: () => setModalOpen(true),
    // Like real Privy, an extension stays connected after logout; only the embedded wallet goes.
    logout: async () => {
      setUser(null);
      setWallets((current) => current.filter((wallet) => wallet.connectorType === "injected"));
    },
    onConnect,
    // A verified wallet signs in as its own Privy user, with no embedded wallet.
    loginWithWallet: (address, walletClientType) => {
      const walletAccount = { type: "wallet", address, walletClientType };
      setUser({ id: `did:privy:fake-${address}`, wallet: walletAccount, linkedAccounts: [walletAccount] });
    },
    fund: (address) => new Promise((_resolve, reject) => setPendingFund({ address, reject })),
    // Connects without a modal, as if the user picked the extension in Privy's wallet list.
    connectWallet: () => {
      const wallet = extension.current();
      setWallets((current) => [...current.filter((candidate) => candidate.connectorType !== "injected"), wallet]);
      for (const listener of onConnect) listener({ wallet });
    },
  };

  return (
    <FakePrivyContext.Provider value={value}>
      {children}
      {modalOpen && overlay(<LoginModal onDone={completeLogin} onClose={() => setModalOpen(false)} />)}
      {pendingSend && overlay(<TransactionModal pending={pendingSend} onClose={() => setPendingSend(null)} />)}
      {pendingSignature &&
        overlay(<SignatureModal pending={pendingSignature} onClose={() => setPendingSignature(null)} />)}
      {pendingFund && overlay(<FundModal pending={pendingFund} onClose={() => setPendingFund(null)} />)}
    </FakePrivyContext.Provider>
  );
}

export function usePrivy() {
  const { user, openLogin, logout } = useFakePrivy();
  return { ready: true, authenticated: user !== null, user, error: null, login: openLogin, logout };
}

export function useWallets() {
  return { ready: true, wallets: useFakePrivy().wallets };
}

export function useLogin(callbacks: { onComplete?: LoginComplete } = {}) {
  const { openLogin, onLogin } = useFakePrivy();
  useEffect(() => {
    const listener = callbacks.onComplete;
    if (!listener) return;
    onLogin.add(listener);
    return () => {
      onLogin.delete(listener);
    };
  }, [callbacks.onComplete, onLogin]);
  return { login: openLogin };
}

export function useLogout() {
  return { logout: useFakePrivy().logout };
}

const unsupported = (feature: string) => () => {
  throw new Error(`fake Privy does not support ${feature}; run test:e2e:real`);
};

export function useConnectWallet(callbacks: { onSuccess?: ConnectSuccess } = {}) {
  const { connectWallet, onConnect } = useFakePrivy();
  useEffect(() => {
    const listener = callbacks.onSuccess;
    if (!listener) return;
    onConnect.add(listener);
    return () => {
      onConnect.delete(listener);
    };
  }, [callbacks.onSuccess, onConnect]);
  return { connectWallet };
}
export const useConnectOrCreateWallet = (_callbacks?: unknown) => ({
  connectOrCreateWallet: unsupported("connectOrCreateWallet"),
});
export const useExportWallet = () => ({ exportWallet: unsupported("exportWallet") });
// The message ends with the signing address, which is all the fake login needs from it.
export function useLoginWithSiwe() {
  const { loginWithWallet } = useFakePrivy();
  return {
    generateSiweMessage: async ({ address }: { address: string }) =>
      `localhost wants you to sign in with your Ethereum account:\n${address}`,
    // Like Privy, the login fails unless the account named in the message made the signature.
    loginWithSiwe: async ({
      message,
      signature,
      walletClientType,
    }: {
      message: string;
      signature: Hex;
      walletClientType?: string;
    }) => {
      const address = (message.split("\n").at(-1) ?? "") as Hex;
      if (!(await verifyMessage({ address, message, signature })))
        throw new Error("Invalid signature for this account.");
      loginWithWallet(address, walletClientType ?? "");
    },
  };
}
export function useFiatOnramp() {
  const { fund } = useFakePrivy();
  return { fund: (options: { destination: { address: string } }) => fund(options.destination.address) };
}
