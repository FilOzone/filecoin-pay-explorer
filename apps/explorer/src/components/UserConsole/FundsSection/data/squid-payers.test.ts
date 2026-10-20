import { describe, expect, it } from "vitest";
import { chooseDefaultPayer, listSquidPayers, readConnectedAccounts } from "./squid-payers";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const SECOND = "0x2222222222222222222222222222222222222222";
const EMBEDDED = "0x3333333333333333333333333333333333333333";
const USDC = "0x4444444444444444444444444444444444444444";

const extension = (address: string, accounts: () => Promise<readonly string[]>) => ({
  address,
  walletClientType: "metamask",
  getEthereumProvider: async () => ({ request: accounts }),
});
const embedded = {
  address: EMBEDDED,
  walletClientType: "privy",
  getEthereumProvider: async () => {
    throw new Error("an embedded wallet's accounts are never read");
  },
};

describe("readConnectedAccounts", () => {
  it("lists every account an extension connected to the site, and only its own for an embedded wallet", async () => {
    const accounts = await readConnectedAccounts([extension(ACCOUNT, async () => [ACCOUNT, SECOND]), embedded]);

    expect(accounts).toEqual({ [ACCOUNT]: [ACCOUNT, SECOND], [EMBEDDED]: [EMBEDDED] });
  });

  it("falls back to the wallet's own account when the extension cannot answer", async () => {
    const accounts = await readConnectedAccounts([
      extension(ACCOUNT, async () => {
        throw new Error("locked");
      }),
      extension(SECOND, async () => []),
    ]);

    expect(accounts).toEqual({ [ACCOUNT]: [ACCOUNT], [SECOND]: [SECOND] });
  });
});

describe("listSquidPayers", () => {
  const metamask = { address: ACCOUNT };
  const filecoinPayWallet = { address: EMBEDDED };

  it("pays with each wallet's own account until the connected accounts load", () => {
    expect(listSquidPayers([metamask, filecoinPayWallet], undefined, undefined)).toEqual([
      { address: ACCOUNT, wallet: metamask },
      { address: EMBEDDED, wallet: filecoinPayWallet },
    ]);
  });

  it("lists the console account first, then every other connected account once", () => {
    const connected = { [ACCOUNT]: [ACCOUNT, SECOND], [EMBEDDED]: [EMBEDDED, ACCOUNT] } as const;

    expect(listSquidPayers([metamask, filecoinPayWallet], connected, EMBEDDED)).toEqual([
      { address: EMBEDDED, wallet: filecoinPayWallet },
      { address: ACCOUNT, wallet: metamask },
      { address: SECOND, wallet: metamask },
    ]);
  });
});

describe("chooseDefaultPayer", () => {
  const payers = [{ address: ACCOUNT }, { address: SECOND }, { address: EMBEDDED }] as const;
  const funded = { [USDC]: 5n };
  const empty = { [USDC]: 0n };

  it("keeps the console account when it holds something to pay with", () => {
    expect(chooseDefaultPayer(payers, { [ACCOUNT]: funded, [SECOND]: funded })).toBe(ACCOUNT);
  });

  it("picks the first account that holds something when the console account holds nothing", () => {
    expect(chooseDefaultPayer(payers, { [ACCOUNT]: empty, [SECOND]: empty, [EMBEDDED]: funded })).toBe(EMBEDDED);
  });

  it("falls back to the console account when nobody holds anything, or balances are unknown", () => {
    expect(chooseDefaultPayer(payers, { [ACCOUNT]: empty, [SECOND]: { [USDC]: null } })).toBe(ACCOUNT);
    expect(chooseDefaultPayer(payers, {})).toBe(ACCOUNT);
  });
});
