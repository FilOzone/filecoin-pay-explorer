/** The `?revoke=` deep link `filecoin-pin logout` prints. */
import { act, create, type ReactTestRendererNode } from "react-test-renderer";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionKeysSection from "./index";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, variant, size, ...props }: React.ComponentProps<"button"> & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({ EmptyStateCard: () => null }));
vi.mock("@filecoin-pay/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/shared/CopyButton", () => ({ default: () => null }));

const switchChain = vi.fn();
vi.mock("wagmi", () => ({ useSwitchChain: () => ({ switchChain }) }));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));

/** The dialog is the unit under test's collaborator; record what it is asked to show. */
const revokeTargets: (string | null)[] = [];
vi.mock("./RevokeDialog", () => ({
  RevokeDialog: ({ sessionKey }: { sessionKey: { sessionKeyPublic: string } | null }) => {
    revokeTargets.push(sessionKey?.sessionKeyPublic ?? null);
    return null;
  },
}));
vi.mock("./CreateKeyFlow", () => ({ CreateKeyFlow: () => null }));

const OWNER = "0x00000000000000000000000000000000000000aa" as Hex;
const KEY = "0x00000000000000000000000000000000000000bb" as Hex;

const listed = {
  name: "laptop",
  sessionKeyPublic: KEY,
  scopes: ["createDataSet"],
  createdAt: 1,
  status: "active" as const,
  scopeExpiries: { createDataSet: 9_999_999_999n },
  scopeActive: { createDataSet: true },
  maxExpiry: 9_999_999_999n,
};

const hooks = vi.hoisted(() => ({ keys: [] as unknown[], syncFromChain: vi.fn(), statusReadsPending: false }));
vi.mock("@/hooks/useSessionKeys", () => ({
  useSessionKeys: () => ({
    keys: hooks.keys,
    addKey: vi.fn(),
    removeKey: vi.fn(),
    syncFromChain: hooks.syncFromChain,
    refetchStatuses: vi.fn(),
    statusReadsPending: hooks.statusReadsPending,
    markConfirmed: vi.fn(),
    registry: { address: "0x00000000000000000000000000000000000000cc", abi: [] },
  }),
}));

/** Render the section with a revoke link for `key`, then let effects settle. */
async function renderWithLink(address: Hex, network: "mainnet" | "calibration" = "calibration") {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <SessionKeysSection network='calibration' account={OWNER} revokeAddress={address} revokeNetwork={network} />,
    );
  });
  return renderer;
}

/** The rendered text in document order, so a sentence split across elements can be matched. */
function text(node: ReactTestRendererNode | ReactTestRendererNode[] | null): string {
  if (node == null) return "";
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  return text(node.children);
}

describe("revoke deep link", () => {
  beforeEach(() => {
    revokeTargets.length = 0;
    hooks.keys = [];
    hooks.syncFromChain.mockReset().mockResolvedValue({ addedCount: 0, updatedCount: 0, skippedUnrecognized: 0 });
    hooks.statusReadsPending = false;
    toastError.mockReset();
    switchChain.mockReset();
  });

  it("opens the dialog on a key this browser already has, without a chain read", async () => {
    hooks.keys = [listed];

    await renderWithLink(KEY);

    expect(revokeTargets.at(-1)).toBe(KEY);
    expect(hooks.syncFromChain).not.toHaveBeenCalled();
  });

  it("syncs from chain for a key this browser has never seen, then opens the dialog", async () => {
    hooks.syncFromChain.mockImplementation(async () => {
      hooks.keys = [listed];
      return { addedCount: 1, updatedCount: 0, skippedUnrecognized: 0 };
    });

    await renderWithLink(KEY);

    expect(hooks.syncFromChain).toHaveBeenCalledTimes(1);
    expect(revokeTargets.at(-1)).toBe(KEY);
  });

  it("syncs for a browser with no keys, where the status query never leaves pending", async () => {
    hooks.statusReadsPending = true;
    hooks.syncFromChain.mockImplementation(async () => {
      hooks.keys = [listed];
      hooks.statusReadsPending = false;
      return { addedCount: 1, updatedCount: 0, skippedUnrecognized: 0 };
    });

    await renderWithLink(KEY);

    expect(hooks.syncFromChain).toHaveBeenCalledTimes(1);
    expect(revokeTargets.at(-1)).toBe(KEY);
  });

  it("says so, once, when the chain does not know the key either", async () => {
    await renderWithLink(KEY);

    expect(hooks.syncFromChain).toHaveBeenCalledTimes(1);
    expect(revokeTargets.at(-1)).toBeNull();
    expect(toastError.mock.calls[0]?.[0]).toBe("That session key is not in this wallet's list");
  });

  it("waits for the sync to settle, whatever re-renders meanwhile", async () => {
    let finishSync!: () => void;
    hooks.syncFromChain.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSync = () => {
            hooks.keys = [listed];
            resolve({ addedCount: 1, updatedCount: 0, skippedUnrecognized: 0 });
          };
        }),
    );

    const rendered = await renderWithLink(KEY);
    // A fresh list reference re-runs the effect.
    hooks.keys = [];
    await act(async () => {
      rendered.update(
        <SessionKeysSection network='calibration' account={OWNER} revokeAddress={KEY} revokeNetwork='calibration' />,
      );
    });

    expect(hooks.syncFromChain).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
    expect(revokeTargets.at(-1)).toBeNull();

    await act(async () => finishSync());

    expect(revokeTargets.at(-1)).toBe(KEY);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("starts over when the wallet changes with a sync in flight", async () => {
    const OTHER = "0x00000000000000000000000000000000000000cc" as Hex;
    let finishSync!: () => void;
    hooks.syncFromChain.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSync = () => resolve({ addedCount: 0, updatedCount: 0, skippedUnrecognized: 0 });
        }),
    );
    const rendered = await renderWithLink(KEY);

    await act(async () => {
      rendered.update(
        <SessionKeysSection network='calibration' account={OTHER} revokeAddress={KEY} revokeNetwork='calibration' />,
      );
    });
    await act(async () => finishSync());

    // The first wallet's sync must not speak for the second; the second gets its own.
    expect(hooks.syncFromChain).toHaveBeenCalledTimes(2);
    expect(toastError.mock.calls.map((c) => c[0])).toEqual(["That session key is not in this wallet's list"]);
  });

  it("keeps the link and reports nothing about the key when the chain read fails", async () => {
    hooks.syncFromChain.mockRejectedValue(new Error("rpc down"));

    await renderWithLink(KEY);

    expect(hooks.syncFromChain).toHaveBeenCalledTimes(1);
    expect(revokeTargets.at(-1)).toBeNull();
    // The sync's own failure toast, and nothing claiming the key is missing.
    expect(toastError.mock.calls.map((c) => c[0])).toEqual(["Sync failed"]);
  });

  it("clears every link param when it acts, not only the revoke ones", async () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        pathname: "/console/session-keys",
        search: `?authorize=${KEY}&scopes=addPieces&revoke=${KEY}&network=calibration`,
        hash: "",
      },
      history: { replaceState },
    });
    hooks.keys = [listed];

    await renderWithLink(KEY);

    // Left behind, `authorize` without its network would report a broken pairing link on reload.
    expect(replaceState).toHaveBeenCalledWith(null, "", "/console/session-keys");
    vi.unstubAllGlobals();
  });

  it("says so instead of doing nothing when the link is for another network", async () => {
    hooks.keys = [listed];

    const rendered = await renderWithLink(KEY, "mainnet");

    expect(revokeTargets.at(-1)).toBeNull();
    expect(hooks.syncFromChain).not.toHaveBeenCalled();
    expect(text(rendered.toJSON())).toContain("This revoke link is for mainnet");
  });

  it("switches to the link's chain on one click, and to that chain, not the connected one", async () => {
    hooks.keys = [listed];

    const rendered = await renderWithLink(KEY, "mainnet");
    const button = rendered.root.findByProps({ "aria-label": "Switch to mainnet" });
    await act(async () => button.props.onClick());

    // 314 is mainnet, the link's network, not the wallet's 314159.
    expect(switchChain.mock.calls).toEqual([[{ chainId: 314 }]]);
  });
});
