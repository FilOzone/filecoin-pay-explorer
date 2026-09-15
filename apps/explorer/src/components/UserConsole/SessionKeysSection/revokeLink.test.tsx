/**
 * The `?revoke=` deep link `filecoin-pin logout` prints: it opens the revoke
 * dialog on the key it names, and syncs from chain first for a key this
 * browser has never seen.
 */
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

const hooks = vi.hoisted(() => ({ keys: [] as unknown[], syncFromChain: vi.fn() }));
vi.mock("@/hooks/useSessionKeys", () => ({
  useSessionKeys: () => ({
    keys: hooks.keys,
    addKey: vi.fn(),
    removeKey: vi.fn(),
    syncFromChain: hooks.syncFromChain,
    refetchStatuses: vi.fn(),
    statusReadsPending: false,
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
    toastError.mockReset();
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

  it("says so, once, when the chain does not know the key either", async () => {
    await renderWithLink(KEY);

    expect(hooks.syncFromChain).toHaveBeenCalledTimes(1);
    expect(revokeTargets.at(-1)).toBeNull();
    expect(toastError.mock.calls[0]?.[0]).toBe("That session key is not in this wallet's list");
  });

  it("says so instead of doing nothing when the link is for another network", async () => {
    hooks.keys = [listed];

    const rendered = await renderWithLink(KEY, "mainnet");

    expect(revokeTargets.at(-1)).toBeNull();
    expect(hooks.syncFromChain).not.toHaveBeenCalled();
    // Silence would leave the owner on a page that looks like it ignored them.
    expect(text(rendered.toJSON())).toContain("This revoke link is for mainnet");
  });
});
