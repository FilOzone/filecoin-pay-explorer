import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { describe, expect, it } from "vitest";
import { SIWE_STATEMENTS, verifySiwe } from "../../api/auth";

const DOMAIN = "pay.filecoin.cloud";
const CHAIN_ID = 314159;
const TEST_EMAIL = "test@example.com";
const STATEMENT = SIWE_STATEMENTS.subscribe(TEST_EMAIL);

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
    statement: STATEMENT,
    ...overrides,
  });
}

function verify(
  message: string,
  signature: string,
  overrides: Partial<{ domain: string; chainId: number; expectedStatement: string }> = {},
) {
  return verifySiwe({
    message,
    signature,
    domain: DOMAIN,
    chainId: CHAIN_ID,
    expectedStatement: STATEMENT,
    ...overrides,
  });
}

describe("verifySiwe", () => {
  it("returns ok: true with the recovered wallet address for a valid signed message", async () => {
    const message = makeSiwe();
    const signature = await account.signMessage({ message });
    expect(await verify(message, signature)).toEqual({
      ok: true,
      walletAddress: account.address,
    });
  });

  it("returns ok: false when the message is not valid SIWE format", async () => {
    // null causes parseSiweMessage to throw (it expects a string to parse)
    const result = await verify(null as unknown as string, "0x1234");
    expect(result).toEqual({ ok: false, error: "Invalid SIWE message format" });
  });

  it("returns ok: false when issuedAt is not a valid date", async () => {
    // createSiweMessage only accepts Date objects, so craft the malformed field by
    // string-replacing the Issued At line in an otherwise valid message.
    const valid = makeSiwe();
    const invalid = valid.replace(/^Issued At: .+$/m, "Issued At: not-a-date");
    const signature = await account.signMessage({ message: invalid });
    expect(await verify(invalid, signature)).toEqual({
      ok: false,
      error: "Invalid issuedAt format in SIWE message",
    });
  });

  it("returns ok: false when issuedAt is older than 5 minutes", async () => {
    const message = makeSiwe({ issuedAt: new Date(Date.now() - 6 * 60 * 1000) });
    const signature = await account.signMessage({ message });
    expect(await verify(message, signature)).toMatchObject({
      ok: false,
      error: expect.stringContaining("expired"),
    });
  });

  it("returns ok: false when issuedAt is in the future", async () => {
    const message = makeSiwe({ issuedAt: new Date(Date.now() + 60_000) });
    const signature = await account.signMessage({ message });
    expect(await verify(message, signature)).toMatchObject({
      ok: false,
      error: expect.stringContaining("future"),
    });
  });

  it("returns ok: false when the statement does not match the expected action", async () => {
    const message = makeSiwe({ statement: "some other action" });
    const signature = await account.signMessage({ message });
    expect(await verify(message, signature)).toEqual({
      ok: false,
      error: "SIWE statement mismatch",
    });
  });

  it("returns ok: false when the statement is missing", async () => {
    const message = makeSiwe({ statement: undefined });
    const signature = await account.signMessage({ message });
    expect(await verify(message, signature)).toEqual({
      ok: false,
      error: "SIWE statement mismatch",
    });
  });

  it("returns ok: false when the domain does not match", async () => {
    const message = makeSiwe({ domain: "evil.example.com" });
    const signature = await account.signMessage({ message });
    expect(await verify(message, signature, { domain: DOMAIN })).toEqual({
      ok: false,
      error: "SIWE domain mismatch",
    });
  });

  it("returns ok: false when the chainId does not match", async () => {
    const message = makeSiwe({ chainId: 1 });
    const signature = await account.signMessage({ message });
    expect(await verify(message, signature)).toMatchObject({
      ok: false,
      error: expect.stringContaining("chainId mismatch"),
    });
  });

  it("returns ok: false when the signature is garbage", async () => {
    const message = makeSiwe();
    const result = await verify(message, "0xdeadbeef");
    expect(result.ok).toBe(false);
  });
});
