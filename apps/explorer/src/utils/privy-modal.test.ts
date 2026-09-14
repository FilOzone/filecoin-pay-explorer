import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForPrivyModalToClose } from "./privy-modal";

it("matches Privy's installed dialog id", () => {
  const distDirectory = dirname(createRequire(import.meta.url).resolve("@privy-io/react-auth"));
  const hasDialogId = readdirSync(distDirectory)
    .filter((file) => file.endsWith(".js"))
    .some((file) => readFileSync(join(distDirectory, file), "utf8").includes('id:"privy-dialog"'));

  expect(hasDialogId).toBe(true);
});

describe("waitForPrivyModalToClose", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves at once when no dialog is mounted", async () => {
    const isMounted = vi.fn(() => false);

    await expect(waitForPrivyModalToClose({ isMounted })).resolves.toBe(true);
    expect(isMounted).toHaveBeenCalledTimes(1);
  });

  it("waits until the dialog leaves the DOM", async () => {
    let mounted = true;
    const result = waitForPrivyModalToClose({ isMounted: () => mounted });

    await vi.advanceTimersByTimeAsync(120);
    mounted = false;
    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe(true);
  });

  it("gives up after the timeout while the dialog stays mounted", async () => {
    const result = waitForPrivyModalToClose({ isMounted: () => true, timeoutMs: 300 });

    await vi.advanceTimersByTimeAsync(400);

    await expect(result).resolves.toBe(false);
  });
});
