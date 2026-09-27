// Stand-in for @privy-io/react-auth, aliased in by next.config.ts when E2E_PRIVY=mock.
// Exports only what the app and @privy-io/wagmi import. Real Privy runs via `test:e2e:privy`.
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { type Hex, numberToHex } from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";

// Real Privy's PRIVY_CONFIG.defaultChain is mainnet.
const DEFAULT_CHAIN_ID = 314;

type Listener = (...args: unknown[]) => void;

/** Every eth_sendTransaction the fake wallet received, readable from Playwright as `window.__fakePrivyTransactions`. */
function sentTransactions(): Record<string, unknown>[] {
  const w = window as typeof window & { __fakePrivyTransactions?: Record<string, unknown>[] };
  w.__fakePrivyTransactions ??= [];
  return w.__fakePrivyTransactions;
}

function createProvider(account: PrivateKeyAccount) {
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
        return [account.address];
      case "eth_chainId":
        return numberToHex(chainId);
      case "wallet_switchEthereumChain":
        return switchChain(Number((params[0] as { chainId: Hex }).chainId));
      case "personal_sign":
        return account.signMessage({ message: { raw: params[0] as Hex } });
      case "eth_signTypedData_v4":
        return account.signTypedData(JSON.parse(params[1] as string));
      // Recorded for the test to read, never signed or broadcast; the dummy hash never confirms.
      case "eth_sendTransaction":
        sentTransactions().push(params[0] as Record<string, unknown>);
        return `0x${"e2".repeat(32)}`;
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
  };
}

function createEmbeddedWallet() {
  const account = privateKeyToAccount(generatePrivateKey());
  const wallet = createProvider(account);
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

type Wallet = ReturnType<typeof createEmbeddedWallet>;
type User = { id: string; wallet?: { address: string; walletClientType: string }; linkedAccounts: object[] };
type LoginComplete = (event: { user: User; isNewUser: boolean; loginAccount: { type: string } }) => void;

type FakePrivy = {
  user: User | null;
  wallets: Wallet[];
  openLogin: () => void;
  logout: () => Promise<void>;
  onLogin: Set<LoginComplete>;
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

export function PrivyProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [onLogin] = useState(() => new Set<LoginComplete>());

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
    logout: async () => {
      setUser(null);
      setWallets([]);
    },
  };

  return (
    <FakePrivyContext.Provider value={value}>
      {children}
      {modalOpen && <LoginModal onDone={completeLogin} onClose={() => setModalOpen(false)} />}
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
  throw new Error(`fake Privy does not support ${feature}; run test:e2e:privy`);
};

export const useConnectWallet = (_callbacks?: unknown) => ({ connectWallet: unsupported("connectWallet") });
export const useConnectOrCreateWallet = (_callbacks?: unknown) => ({
  connectOrCreateWallet: unsupported("connectOrCreateWallet"),
});
export const useExportWallet = () => ({ exportWallet: unsupported("exportWallet") });
export const useFiatOnramp = () => ({ fund: unsupported("fund") });
