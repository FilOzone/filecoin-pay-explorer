// @vitest-environment jsdom
/** The `?authorize=` deep link `filecoin-pin login` prints. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScopeId } from "@/utils/sessionKeys";
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
vi.mock("wagmi", () => ({ useSwitchChain: () => ({ switchChain: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./RevokeDialog", () => ({ RevokeDialog: () => null }));

interface CreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillAddress: Hex | null;
  prefillScopes: ScopeId[] | null;
  onConfirmed: (signer: Hex) => void;
}
/** The dialog is the unit under test's collaborator; record what it is asked to show. */
const createRenders: CreateProps[] = [];
vi.mock("./CreateKeyFlow", () => ({
  CreateKeyFlow: (props: CreateProps) => {
    createRenders.push(props);
    return null;
  },
}));

const OWNER = "0x00000000000000000000000000000000000000aa" as Hex;
const KEY = "0x00000000000000000000000000000000000000bb" as Hex;
const SCOPES: ScopeId[] = ["createDataSet", "addPieces", "schedulePieceRemovals"];

/** The link's key, already in this browser's list. */
const listedKey = {
  name: "laptop",
  sessionKeyPublic: KEY,
  scopes: ["createDataSet"],
  createdAt: 1,
  scopeExpiries: { createDataSet: 9_999_999_999n },
  scopeActive: { createDataSet: true },
  maxExpiry: 9_999_999_999n,
};

const hooks = vi.hoisted(() => ({ keys: [] as unknown[], statusReadsPending: false }));
vi.mock("@/hooks/useSessionKeys", () => ({
  useSessionKeys: () => ({
    keys: hooks.keys,
    addKey: vi.fn(),
    removeKey: vi.fn(),
    syncFromChain: vi.fn(),
    refetchStatuses: vi.fn(),
    statusReadsPending: hooks.statusReadsPending,
    markConfirmed: vi.fn(),
    registry: { address: "0x00000000000000000000000000000000000000cc", abi: [] },
  }),
}));

function section(network: "mainnet" | "calibration" = "calibration", account: Hex = OWNER) {
  return (
    <SessionKeysSection
      network={network}
      account={account}
      prefillAddress={KEY}
      prefillScopes={SCOPES}
      prefillNetwork='calibration'
    />
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const lastCreate = () => createRenders.at(-1);

describe("authorize deep link", () => {
  beforeEach(() => {
    createRenders.length = 0;
    hooks.keys = [];
    hooks.statusReadsPending = false;
  });

  it("opens the dialog prefilled with the link's address and scopes", async () => {
    render(section());

    expect(lastCreate()).toMatchObject({ open: true, prefillAddress: KEY, prefillScopes: SCOPES });
  });

  it("does not open again by itself once closed", async () => {
    const { rerender } = render(section());

    await act(async () => lastCreate()?.onOpenChange(false));
    await act(async () => rerender(section()));

    expect(lastCreate()?.open).toBe(false);
  });

  it("waits for a listed key's status before opening", async () => {
    hooks.keys = [{ ...listedKey, status: "unknown" }];
    hooks.statusReadsPending = true;
    const { rerender } = render(section());

    expect(lastCreate()?.open).toBe(false);

    hooks.keys = [{ ...listedKey, status: "active" }];
    hooks.statusReadsPending = false;
    await act(async () => rerender(section()));

    expect(lastCreate()).toMatchObject({ open: true, prefillAddress: KEY });
  });

  it("leaves a form the owner opened by hand while the key's status loaded", async () => {
    hooks.keys = [{ ...listedKey, status: "unknown" }];
    hooks.statusReadsPending = true;
    const { rerender } = render(section());

    fireEvent.click(screen.getByText("+ New session key"));
    hooks.keys = [{ ...listedKey, status: "active" }];
    hooks.statusReadsPending = false;
    await act(async () => rerender(section()));

    expect(lastCreate()).toMatchObject({ open: true, prefillAddress: null });
  });

  it("drops the link from the URL once its key's login confirms, so a reload does not reopen the form", async () => {
    window.history.replaceState(
      null,
      "",
      "/console/session-keys?authorize=0xbb&scopes=createDataSet&network=calibration",
    );
    render(section());

    await act(async () => lastCreate()?.onConfirmed("0x00000000000000000000000000000000000000cc" as Hex));
    expect(window.location.search).not.toBe("");

    await act(async () => lastCreate()?.onConfirmed(KEY));
    expect(window.location.search).toBe("");
  });

  it("does not open while the wallet is on another network", async () => {
    render(section("mainnet"));

    expect(lastCreate()?.open).toBe(false);
  });
});
