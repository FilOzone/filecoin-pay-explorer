#!/usr/bin/env node
// Writes contract ABIs consumed by graph-cli from the canonical @filoz/synapse-core
// package into packages/subgraph/abis/*.json. Running this before `graph codegen`
// keeps the subgraph in lock-step with the source of truth; bumping the synapse-core
// version is all that's needed to pick up ABI changes.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { erc20, filecoinPay } from "@filoz/synapse-core/abis";

const here = dirname(fileURLToPath(import.meta.url));
const abisDir = join(here, "..", "abis");

const targets = [
  { file: "Payments-abi.json", abi: filecoinPay },
  { file: "erc20-abi.json", abi: erc20 },
];

await mkdir(abisDir, { recursive: true });

for (const { file, abi } of targets) {
  const outPath = join(abisDir, file);
  await writeFile(outPath, `${JSON.stringify(abi, null, 2)}\n`);
  console.log(`wrote ${outPath} (${abi.length} entries)`);
}
