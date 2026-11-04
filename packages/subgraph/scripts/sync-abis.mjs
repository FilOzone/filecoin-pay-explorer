#!/usr/bin/env node
// Writes contract ABIs consumed by graph-cli from the canonical @filoz/synapse-core
// package into packages/subgraph/abis/*.json. Running this before `graph codegen`
// keeps the subgraph in lock-step with the source of truth; bumping the synapse-core
// version is all that's needed to pick up ABI changes.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { erc20, filecoinPay, fwss, pdp } from "@filoz/synapse-core/abis";

const here = dirname(fileURLToPath(import.meta.url));
const abisDir = join(here, "..", "abis");

const targets = [
  { file: "Payments-abi.json", abi: filecoinPay },
  { file: "erc20-abi.json", abi: erc20 },
  { file: "FilecoinWarmStorageService-abi.json", abi: fwss },
  { file: "PDPVerifier-abi.json", abi: pdp },
];

await mkdir(abisDir, { recursive: true });

for (const { file, abi } of targets) {
  const outPath = join(abisDir, file);
  // graph-node's ABI parser rejects events without `anonymous`; viem-style ABIs (e.g. erc20) omit it.
  const normalized = abi.map((entry) => (entry.type === "event" ? { anonymous: false, ...entry } : entry));
  await writeFile(outPath, `${JSON.stringify(normalized, null, 2)}\n`);
  console.log(`wrote ${outPath} (${abi.length} entries)`);
}
