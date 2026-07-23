import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  createVerifiedSubscription,
  deleteSubscription,
  findSubscriptionByWallet,
  findVerifiedEmailByEmail,
  upsertVerifiedEmail,
  upsertWalletSubscription,
} from "../../../shared/db/queries";

const WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
const WALLET2 = "0x1111111111111111111111111111111111111111";
const EMAIL = "alice@example.com";
const EMAIL2 = "bob@example.com";

function db() {
  return createDb(env.DB);
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM wallet_subscriptions").run();
  await env.DB.prepare("DELETE FROM verified_emails").run();
});

// ─── findSubscriptionByWallet ─────────────────────────────────────────────────

describe("findSubscriptionByWallet", () => {
  it("returns null when no subscription exists", async () => {
    expect(await findSubscriptionByWallet(db(), WALLET)).toBeNull();
  });

  it("returns the subscription row when one exists", async () => {
    await upsertVerifiedEmail(db(), { id: "email-1", email: EMAIL, preferredName: "Alice" });
    await upsertWalletSubscription(db(), { id: "sub-1", walletAddress: WALLET, verifiedEmailId: "email-1" });
    const sub = await findSubscriptionByWallet(db(), WALLET);
    expect(sub).toMatchObject({ id: "sub-1", walletAddress: WALLET, verifiedEmailId: "email-1" });
  });
});

// ─── findVerifiedEmailByEmail ─────────────────────────────────────────────────

describe("findVerifiedEmailByEmail", () => {
  it("returns null when no email exists", async () => {
    expect(await findVerifiedEmailByEmail(db(), EMAIL)).toBeNull();
  });

  it("returns the email row when one exists", async () => {
    await upsertVerifiedEmail(db(), { id: "email-1", email: EMAIL, preferredName: "Alice" });
    const row = await findVerifiedEmailByEmail(db(), EMAIL);
    expect(row).toMatchObject({ id: "email-1", email: EMAIL, preferredName: "Alice" });
  });
});

// ─── upsertVerifiedEmail ─────────────────────────────────────────────────────

describe("upsertVerifiedEmail", () => {
  it("inserts a new row and returns it", async () => {
    const row = await upsertVerifiedEmail(db(), { id: "email-1", email: EMAIL, preferredName: "Alice" });
    expect(row).toMatchObject({ id: "email-1", email: EMAIL, preferredName: "Alice" });
  });

  it("updates preferredName on conflict with the same email", async () => {
    await upsertVerifiedEmail(db(), { id: "email-1", email: EMAIL, preferredName: "Alice" });
    const row = await upsertVerifiedEmail(db(), { id: "email-1", email: EMAIL, preferredName: "Alicia" });
    expect(row.preferredName).toBe("Alicia");
    expect(await findVerifiedEmailByEmail(db(), EMAIL)).toMatchObject({ preferredName: "Alicia" });
  });
});

// ─── createVerifiedSubscription ───────────────────────────────────────────────

describe("createVerifiedSubscription", () => {
  it("creates verified_email and wallet_subscription rows", async () => {
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    expect(await findVerifiedEmailByEmail(db(), EMAIL)).toMatchObject({ email: EMAIL });
    expect(await findSubscriptionByWallet(db(), WALLET)).toMatchObject({ walletAddress: WALLET });
  });

  it("replaces the email and deletes the orphaned verified_email row", async () => {
    // First subscription uses alice@example.com
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });

    // Same wallet switches to bob@example.com — email-1 becomes orphaned
    await createVerifiedSubscription(db(), {
      emailId: "email-2",
      email: EMAIL2,
      preferredName: "Bob",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });

    expect(await findVerifiedEmailByEmail(db(), EMAIL)).toBeNull();
    expect(await findVerifiedEmailByEmail(db(), EMAIL2)).toMatchObject({ email: EMAIL2 });
  });

  it("does not delete a verified_email that still has other subscriptions", async () => {
    // Two wallets share the same email
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-2",
      walletAddress: WALLET2,
    });

    // WALLET2 switches away from email-1 — but WALLET still references it, so it must survive
    await createVerifiedSubscription(db(), {
      emailId: "email-2",
      email: EMAIL2,
      preferredName: "Bob",
      subscriptionId: "sub-2",
      walletAddress: WALLET2,
    });

    expect(await findVerifiedEmailByEmail(db(), EMAIL)).toMatchObject({ email: EMAIL });
  });
});

// ─── deleteSubscription ───────────────────────────────────────────────────────

describe("deleteSubscription", () => {
  it("removes the subscription row", async () => {
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    await deleteSubscription(db(), WALLET);
    expect(await findSubscriptionByWallet(db(), WALLET)).toBeNull();
  });

  it("deletes the orphaned verified_email row after the last subscription is removed", async () => {
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    await deleteSubscription(db(), WALLET);
    expect(await findVerifiedEmailByEmail(db(), EMAIL)).toBeNull();
  });

  it("does not delete verified_email when another subscription still references it", async () => {
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    await createVerifiedSubscription(db(), {
      emailId: "email-1",
      email: EMAIL,
      preferredName: "Alice",
      subscriptionId: "sub-2",
      walletAddress: WALLET2,
    });
    await deleteSubscription(db(), WALLET);
    expect(await findVerifiedEmailByEmail(db(), EMAIL)).toMatchObject({ email: EMAIL });
  });

  it("is a no-op when the wallet has no subscription", async () => {
    await expect(deleteSubscription(db(), WALLET)).resolves.toBeUndefined();
  });
});
