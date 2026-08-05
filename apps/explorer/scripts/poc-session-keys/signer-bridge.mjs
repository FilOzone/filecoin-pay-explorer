// Local test-only wallet bridge for headless browser testing: exposes a JSON-RPC-ish
// endpoint that signs with the ~/.calib.env key on calibration.
// The injected EIP-1193 shim in the test browser fetches this endpoint.
// Run: cd apps/explorer && node scripts/poc-session-keys/signer-bridge.mjs

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const pk = readFileSync(join(homedir(), ".calib.env"), "utf8").trim().split("\n")[0];
const account = privateKeyToAccount(pk);

const chain = defineChain({
  id: 314159,
  name: "Filecoin Calibration",
  nativeCurrency: { name: "tFIL", symbol: "tFIL", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.calibration.node.glif.io/rpc/v1"] } },
});
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ chain, transport: http(), account });

async function handle(method, params) {
  switch (method) {
    case "eth_chainId":
      return "0x4cb2f";
    case "net_version":
      return "314159";
    case "eth_accounts":
    case "eth_requestAccounts":
      return [account.address];
    case "wallet_switchEthereumChain":
      return null;
    case "wallet_requestPermissions":
      return [{ parentCapability: "eth_accounts" }];
    case "eth_sendTransaction": {
      const tx = params[0];
      return walletClient.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
    }
    case "personal_sign":
      return walletClient.signMessage({ message: { raw: params[0] } });
    case "eth_signTypedData_v4":
      return walletClient.signTypedData(JSON.parse(params[1]));
    default:
      return publicClient.request({ method, params });
  }
}

const server = createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const { method, params } = JSON.parse(body);
      const result = await handle(method, params ?? []);
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify({ result }, (_k, v) => (typeof v === "bigint" ? `0x${v.toString(16)}` : v)));
    } catch (err) {
      console.error(`[bridge] ${err.message}`);
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify({ error: { message: err.shortMessage || err.message, code: err.code ?? -32000 } }));
    }
  });
});

server.listen(18787, "127.0.0.1", () => console.log(`bridge ready on 127.0.0.1:18787 as ${account.address}`));
