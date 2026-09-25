import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

// The published CLI users run; set FILECOIN_PIN_BIN to a local build's dist/cli.js to test an unreleased branch.
const FILECOIN_PIN_VERSION = "2.1.1";

type Cli = { run: (...args: string[]) => Promise<string> };

/** A filecoin-pin CLI pointed at `consoleUrl`, with its own HOME so the saved session key stays out of yours. */
export async function filecoinPin(consoleUrl: string): Promise<Cli> {
  const home = await mkdtemp(path.join(tmpdir(), "filecoin-pin-e2e-"));
  const [command, prefix] = process.env.FILECOIN_PIN_BIN
    ? ["node", [process.env.FILECOIN_PIN_BIN]]
    : ["npx", ["-y", `filecoin-pin@${FILECOIN_PIN_VERSION}`]];
  const env = {
    ...process.env,
    HOME: home,
    CONSOLE_URL: consoleUrl,
    npm_config_cache: process.env.npm_config_cache ?? path.join(homedir(), ".npm"),
  };
  return {
    // `login --no-wait` exits 2 by design, so the output is read whatever the exit code.
    run: (...args) =>
      new Promise((resolve) => {
        execFile(command, [...prefix, ...args], { env, timeout: 120_000 }, (_error, stdout, stderr) =>
          resolve(`${stdout}${stderr}`),
        );
      }),
  };
}

/** The console path (with query) of the first link in CLI output that points at `consoleUrl`. */
export function consoleLink(output: string, consoleUrl: string): string {
  const url = output.split("\n").find((line) => line.startsWith(consoleUrl));
  if (!url) throw new Error(`no ${consoleUrl} link in filecoin-pin output:\n${output}`);
  const { pathname, search } = new URL(url.trim());
  return `${pathname}${search}`;
}
