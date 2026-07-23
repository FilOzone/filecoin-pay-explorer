import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { deletePendingVerification, readPendingVerification, writePendingVerification } from "../../shared/kv";

const WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
const TOKEN = "550e8400-e29b-41d4-a716-446655440000";
const DATA = { token: TOKEN, email: "alice@example.com", preferredName: "Alice" };

const kv = () => env.TEST_KV;

beforeEach(async () => {
  await env.TEST_KV.delete(`verify:${WALLET}`);
});

describe("writePendingVerification + readPendingVerification", () => {
  it("returns the payload when the token matches", async () => {
    await writePendingVerification(kv(), WALLET, DATA);
    expect(await readPendingVerification(kv(), WALLET, TOKEN)).toEqual({
      email: "alice@example.com",
      preferredName: "Alice",
    });
  });

  it("returns null when the token does not match", async () => {
    await writePendingVerification(kv(), WALLET, DATA);
    expect(await readPendingVerification(kv(), WALLET, "wrong-token")).toBeNull();
  });

  it("returns null when no entry exists for the wallet", async () => {
    expect(await readPendingVerification(kv(), WALLET, TOKEN)).toBeNull();
  });

  it("returns null when the stored value is malformed JSON", async () => {
    await env.TEST_KV.put(`verify:${WALLET}`, "not-json");
    expect(await readPendingVerification(kv(), WALLET, TOKEN)).toBeNull();
  });

  it("returns null when required fields are missing from the stored value", async () => {
    await env.TEST_KV.put(`verify:${WALLET}`, JSON.stringify({ token: TOKEN }));
    expect(await readPendingVerification(kv(), WALLET, TOKEN)).toBeNull();
  });

  it("writing a new token for the same wallet invalidates the previous one", async () => {
    await writePendingVerification(kv(), WALLET, DATA);
    const newToken = "new-token-uuid";
    await writePendingVerification(kv(), WALLET, { ...DATA, token: newToken });
    expect(await readPendingVerification(kv(), WALLET, TOKEN)).toBeNull();
    expect(await readPendingVerification(kv(), WALLET, newToken)).toEqual({
      email: "alice@example.com",
      preferredName: "Alice",
    });
  });
});

describe("deletePendingVerification", () => {
  it("removes the entry so subsequent reads return null", async () => {
    await writePendingVerification(kv(), WALLET, DATA);
    await deletePendingVerification(kv(), WALLET);
    expect(await readPendingVerification(kv(), WALLET, TOKEN)).toBeNull();
  });

  it("is a no-op when the entry does not exist", async () => {
    await expect(deletePendingVerification(kv(), WALLET)).resolves.toBeUndefined();
  });
});
