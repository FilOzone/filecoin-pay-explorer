// Manual integration test: full session-key lifecycle against SessionKeyRegistry on calibration.
// login(signer, expiry, [scopes], origin) -> authorizationExpiry reads -> revoke -> reads return 0.
// Run: cd apps/explorer && node scripts/poc-session-keys/chain-cycle.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { calibration } from "@filoz/synapse-sdk";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// Single source of truth for scope typehashes (node 26 strips TS types on import)
import { SESSION_KEY_SCOPES } from "../../src/utils/sessionKeys.ts";

const SCOPES = SESSION_KEY_SCOPES.map((s) => s.typehash);
const ORIGIN = "poc-chain-cycle";

const pk = readFileSync(join(homedir(), ".calib.env"), "utf8").trim().split("\n")[0];
const account = privateKeyToAccount(pk);
const registry = calibration.contracts.sessionKeyRegistry;

const chain = defineChain({
  id: calibration.id,
  name: "Filecoin Calibration",
  nativeCurrency: { name: "tFIL", symbol: "tFIL", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.calibration.node.glif.io/rpc/v1"] } },
});

const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ chain, transport: http(), account });

const sessionAccount = privateKeyToAccount(generatePrivateKey());
const expiry = BigInt(Math.floor(Date.now() / 1000) + 900);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const readExpiry = (scope) =>
  publicClient.readContract({
    address: registry.address,
    abi: registry.abi,
    functionName: "authorizationExpiry",
    args: [account.address, sessionAccount.address, scope],
  });

console.log("identity (payer) :", account.address);
console.log("session signer   :", sessionAccount.address);
console.log("registry         :", registry.address);

// 1. login
const loginHash = await walletClient.writeContract({
  address: registry.address,
  abi: registry.abi,
  functionName: "login",
  args: [sessionAccount.address, expiry, SCOPES, ORIGIN],
});
console.log("login tx         :", loginHash);
const loginReceipt = await publicClient.waitForTransactionReceipt({ hash: loginHash });
if (loginReceipt.status !== "success") fail(`login reverted (${loginHash})`);

// 2. verify both scopes granted
for (const scope of SCOPES) {
  const got = await readExpiry(scope);
  if (got !== expiry) fail(`authorizationExpiry after login: expected ${expiry}, got ${got} (scope ${scope})`);
}
console.log("after login      : both scopes ->", expiry.toString(), "(active) ✓");

// 3. revoke
const revokeHash = await walletClient.writeContract({
  address: registry.address,
  abi: registry.abi,
  functionName: "revoke",
  args: [sessionAccount.address, SCOPES, ORIGIN],
});
console.log("revoke tx        :", revokeHash);
const revokeReceipt = await publicClient.waitForTransactionReceipt({ hash: revokeHash });
if (revokeReceipt.status !== "success") fail(`revoke reverted (${revokeHash})`);

// 4. verify both scopes zeroed
for (const scope of SCOPES) {
  const got = await readExpiry(scope);
  if (got !== 0n) fail(`authorizationExpiry after revoke: expected 0, got ${got} (scope ${scope})`);
}
console.log("after revoke     : both scopes -> 0 (revoked) ✓");
console.log("PASS: full login -> read -> revoke -> read cycle verified on calibration");
