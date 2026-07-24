import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { describe, expect, it } from "vitest";
import { verifySiwe } from "../../api/auth";

const DOMAIN = "pay.filecoin.cloud";
const CHAIN_ID = 314159;

// Anvil default key — safe for tests, never deployed
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

function makeSiwe(overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  return createSiweMessage({
    address: account.address,
    chainId: CHAIN_ID,
    domain: DOMAIN,
    nonce: "testonce1",
    uri: `https://${DOMAIN}/verify`,
    version: "1",
    issuedAt: new Date(Date.now() - 1000),
    ...overrides,
  });
}

describe("verifySiwe", () => {
  it("returns ok: true with the recovered wallet address for a valid signed message", async () => {
    const message = makeSiwe();
    const signature = await account.signMessage({ message });
    expect(await verifySiwe({ message, signature, domain: DOMAIN, chainId: CHAIN_ID })).toEqual({
      ok: true,
      walletAddress: account.address,
    });
  });

  it("returns ok: false when the message is not valid SIWE format", async () => {
    // null causes parseSiweMessage to throw (it expects a string to parse)
    const result = await verifySiwe({
      message: null as unknown as string,
      signature: "0x1234",
      domain: DOMAIN,
      chainId: CHAIN_ID,
    });
    expect(result).toEqual({ ok: false, error: "Invalid SIWE message format" });
  });

  it("returns ok: false when issuedAt is older than 5 minutes", async () => {
    const message = makeSiwe({ issuedAt: new Date(Date.now() - 6 * 60 * 1000) });
    const signature = await account.signMessage({ message });
    expect(await verifySiwe({ message, signature, domain: DOMAIN, chainId: CHAIN_ID })).toMatchObject({
      ok: false,
      error: expect.stringContaining("expired"),
    });
  });

  it("returns ok: false when issuedAt is in the future", async () => {
    const message = makeSiwe({ issuedAt: new Date(Date.now() + 60_000) });
    const signature = await account.signMessage({ message });
    expect(await verifySiwe({ message, signature, domain: DOMAIN, chainId: CHAIN_ID })).toMatchObject({
      ok: false,
      error: expect.stringContaining("future"),
    });
  });

  it("returns ok: false when the domain does not match", async () => {
    const message = makeSiwe({ domain: "evil.example.com" });
    const signature = await account.signMessage({ message });
    expect(await verifySiwe({ message, signature, domain: DOMAIN, chainId: CHAIN_ID })).toEqual({
      ok: false,
      error: "SIWE domain mismatch",
    });
  });

  it("returns ok: false when the chainId does not match", async () => {
    const message = makeSiwe({ chainId: 1 });
    const signature = await account.signMessage({ message });
    expect(await verifySiwe({ message, signature, domain: DOMAIN, chainId: CHAIN_ID })).toMatchObject({
      ok: false,
      error: expect.stringContaining("chainId mismatch"),
    });
  });

  it("returns ok: false when the signature is garbage", async () => {
    const message = makeSiwe();
    const result = await verifySiwe({ message, signature: "0xdeadbeef", domain: DOMAIN, chainId: CHAIN_ID });
    expect(result.ok).toBe(false);
  });
});
