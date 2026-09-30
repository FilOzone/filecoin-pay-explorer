import { type Address, getAddress } from "viem";
import { isPrivyEmbeddedWallet } from "../../console-wallet";
import type { SourceTokenBalances } from "./source-token-balances";

/** An account that can pay a Squid deposit, and the wallet whose provider signs for it. */
export type SquidPayer<Wallet> = { address: Address; wallet: Wallet };

/** Accounts each wallet lets this site sign with, keyed by the wallet's own lowercase address. */
export type ConnectedAccounts = Readonly<Record<string, readonly Address[]>>;

type AccountsWallet = {
  address: string;
  walletClientType: string;
  getEthereumProvider: () => Promise<{ request: (args: { method: "eth_accounts" }) => Promise<readonly string[]> }>;
};

/**
 * Privy tracks one address per extension, but an extension like MetaMask can connect several accounts to the
 * site and sign for any of them. Embedded wallets have exactly one.
 */
export async function readConnectedAccounts(wallets: readonly AccountsWallet[]): Promise<ConnectedAccounts> {
  const entries = await Promise.all(
    wallets.map(async (wallet): Promise<[string, Address[]]> => {
      const own = [getAddress(wallet.address)];
      if (isPrivyEmbeddedWallet(wallet)) return [wallet.address.toLowerCase(), own];
      try {
        const provider = await wallet.getEthereumProvider();
        const accounts = (await provider.request({ method: "eth_accounts" })).map((account) => getAddress(account));
        return [wallet.address.toLowerCase(), accounts.length > 0 ? accounts : own];
      } catch {
        // Unreadable accounts leave the wallet paying with the account Privy already reports.
        return [wallet.address.toLowerCase(), own];
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Every account that can pay, with the console account first. Before accounts load, each wallet's own. */
export function listSquidPayers<Wallet extends { address: string }>(
  wallets: readonly Wallet[],
  connectedAccounts: ConnectedAccounts | undefined,
  recipient: string | undefined,
): SquidPayer<Wallet>[] {
  const payers = new Map<string, SquidPayer<Wallet>>();
  for (const wallet of wallets) {
    const accounts = connectedAccounts?.[wallet.address.toLowerCase()] ?? [getAddress(wallet.address)];
    for (const address of accounts) {
      if (!payers.has(address.toLowerCase())) payers.set(address.toLowerCase(), { address, wallet });
    }
  }
  const all = [...payers.values()];
  const isRecipient = (payer: SquidPayer<Wallet>) => payer.address.toLowerCase() === recipient?.toLowerCase();
  return [...all.filter(isRecipient), ...all.filter((payer) => !isRecipient(payer))];
}

// Holds any listed token on the network, the native coin included. An unknown balance does not count.
const isFunded = (balances: SourceTokenBalances | undefined) =>
  balances !== undefined && Object.values(balances).some((balance) => balance != null && balance > 0n);

/**
 * The console account pays when it holds something to pay with; otherwise the first account that does; otherwise
 * the console account. Payers come console account first, so the first funded payer settles all three cases.
 */
export function chooseDefaultPayer(
  payers: readonly { address: Address }[],
  inventories: Readonly<Record<string, SourceTokenBalances | undefined>>,
): Address | undefined {
  return (payers.find((payer) => isFunded(inventories[payer.address.toLowerCase()])) ?? payers[0])?.address;
}
