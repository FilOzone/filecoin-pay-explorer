/**
 * The missing-key toast against the real sonner Toaster. sonner's Toaster
 * re-subscribes to its store whenever its toast list changes, and React runs
 * every effect cleanup in a commit before any effect body. A toast published
 * from an effect that commits together with a Toaster update therefore has
 * no subscriber and is never rendered, though `toast.getHistory()` records it.
 */

import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Toaster, toast } from "sonner";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionKeysSection from "./index";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({ EmptyStateCard: () => null }));
vi.mock("@filecoin-pay/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/shared/CopyButton", () => ({ default: () => null }));
vi.mock("wagmi", () => ({ useSwitchChain: () => ({ switchChain: vi.fn() }) }));
vi.mock("./RevokeDialog", () => ({ RevokeDialog: () => null }));
vi.mock("./CreateKeyFlow", () => ({ CreateKeyFlow: () => null }));

const hooks = vi.hoisted(() => ({ syncFromChain: vi.fn() }));
vi.mock("@/hooks/useSessionKeys", () => ({
  useSessionKeys: () => ({
    keys: [],
    addKey: vi.fn(),
    removeKey: vi.fn(),
    syncFromChain: hooks.syncFromChain,
    refetchStatuses: vi.fn(),
    statusReadsPending: false,
    markConfirmed: vi.fn(),
    registry: { address: "0x00000000000000000000000000000000000000cc", abi: [] },
  }),
}));

const OWNER = "0x00000000000000000000000000000000000000aa" as Hex;
const KEY = "0x00000000000000000000000000000000000000bb" as Hex;

/** Enough of a DOM for the Toaster's effects; the renderer never touches real nodes. */
const noop = () => {};
const globals = {
  document: {
    hidden: false,
    documentElement: { getAttribute: () => "ltr" },
    addEventListener: noop,
    removeEventListener: noop,
  },
  window: {
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    addEventListener: noop,
    removeEventListener: noop,
    location: { search: "", pathname: "/console/session-keys", hash: "" },
    history: { replaceState: noop },
  },
  getComputedStyle: () => ({ direction: "ltr" }),
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
};
const nodeMock = () => ({ style: {}, getBoundingClientRect: () => ({ height: 40 }), contains: () => false });

describe("revoke deep link, missing-key toast", () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    for (const [k, v] of Object.entries(globals)) vi.stubGlobal(k, v);
    hooks.syncFromChain.mockReset();
  });
  afterEach(async () => {
    await act(async () => renderer.unmount());
    toast.getHistory().splice(0);
  });

  it("renders even when the sync toast and the sync result commit together", async () => {
    let finishSync!: () => void;
    hooks.syncFromChain.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSync = () => resolve({ addedCount: 0, updatedCount: 0, skippedUnrecognized: 0 });
        }),
    );
    await act(async () => {
      renderer = create(
        <>
          <SessionKeysSection network='calibration' account={OWNER} revokeAddress={KEY} revokeNetwork='calibration' />
          <Toaster duration={Number.POSITIVE_INFINITY} />
        </>,
        { createNodeMock: nodeMock },
      );
    });
    expect(hooks.syncFromChain).toHaveBeenCalledTimes(1);

    // sonner defers its state update behind setTimeout; hold those callbacks so
    // the "up to date" toast lands in the same commit as `revokeLinkSynced`.
    const held: (() => void)[] = [];
    vi.stubGlobal("setTimeout", (cb: () => void) => {
      held.push(cb);
      return 0;
    });
    await act(async () => {
      finishSync();
      await Promise.resolve();
      held.shift()?.();
    });
    await act(async () => {
      while (held.length) held.shift()?.();
    });

    const rendered = renderer.root
      .findAll((n) => n.props?.["data-sonner-toast"] !== undefined)
      .map((n) => n.props["data-type"]);
    expect(toast.getHistory().map((t) => ("title" in t ? t.title : null))).toEqual([
      "Everything already up to date",
      "That session key is not in this wallet's list",
    ]);
    expect(rendered).toContain("error");
  });
});
