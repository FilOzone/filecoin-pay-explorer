// @vitest-environment jsdom
/** An approval-only funding link (`/console?operator=fwss&network=…`) checks the existing approval first. */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserConsole from "./(console)/page";

const OWNER = "0x1111111111111111111111111111111111111111";

const wallet = vi.hoisted(() => ({ address: "0x1111111111111111111111111111111111111111", chainId: 314 }));
/** What the approval read reports; tests change it and rerender. */
const approvalRead = vi.hoisted(() => ({
  data: undefined as readonly [boolean, ...bigint[]] | undefined,
  isPending: true,
  enabled: [] as boolean[],
}));
const dialogOpens = vi.hoisted(() => ({ count: 0 }));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => wallet,
  useReadContract: ({ query }: { query?: { enabled?: boolean } }) => {
    approvalRead.enabled.push(query?.enabled === true);
    return { data: approvalRead.data, isPending: approvalRead.isPending };
  },
}));
vi.mock("@/components/UserConsole/providers/TopUpActivityContext", () => ({
  useTopUpActivity: () => ({ isTopUpActive: false }),
}));
vi.mock("@/components/UserConsole/States", () => ({
  AccountNotFound: () => null,
  ErrorState: () => null,
  NotConnected: () => null,
  UnsupportedChain: () => null,
}));
vi.mock("@/components/UserConsole", () => ({
  AlertsBanner: () => null,
  FundsSection: () => null,
  OperatorApprovalsSection: () => null,
  ServicesSection: () => null,
}));
vi.mock("@/components/UserConsole/AddServiceDialog", () => ({
  default: () => {
    dialogOpens.count += 1;
    return <div role='dialog' aria-label='Add a Service' />;
  },
}));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountDetails: () => ({ data: { id: OWNER }, error: null, isLoading: false }),
}));
vi.mock("@/hooks/useNotificationStatus", () => ({
  useNotificationStatus: () => ({ data: undefined, isError: false }),
}));

const NOTICE = "Warm Storage is already approved";
const dialog = () => screen.queryByRole("dialog", { name: "Add a Service" });

async function openApprovalLink() {
  window.history.replaceState(null, "", "/console?operator=fwss&network=mainnet");
  let rerender!: () => void;
  await act(async () => {
    const result = render(<UserConsole />);
    rerender = () => result.rerender(<UserConsole />);
  });
  return { rerender: () => act(async () => rerender()) };
}

describe("approval-only funding link", () => {
  beforeEach(() => {
    approvalRead.data = undefined;
    approvalRead.isPending = true;
    approvalRead.enabled = [];
    dialogOpens.count = 0;
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("opens nothing while the approval is still being read", async () => {
    await openApprovalLink();

    expect(dialog()).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(approvalRead.enabled.at(-1)).toBe(true);
  });

  it("says so instead of opening the dialog when Warm Storage is already approved", async () => {
    const { rerender } = await openApprovalLink();

    approvalRead.data = [true, 1n, 1n, 0n, 0n, 1n];
    approvalRead.isPending = false;
    await rerender();

    expect(screen.getByText(NOTICE)).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it("opens the dialog when Warm Storage is not approved", async () => {
    const { rerender } = await openApprovalLink();

    approvalRead.data = [false, 0n, 0n, 0n, 0n, 0n];
    approvalRead.isPending = false;
    await rerender();

    expect(dialog()).not.toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("opens the dialog when the read fails, for the owner to review", async () => {
    const { rerender } = await openApprovalLink();

    approvalRead.isPending = false;
    await rerender();

    expect(dialog()).not.toBeNull();
  });

  it("keeps the first answer after the owner approves, and stops reading", async () => {
    const { rerender } = await openApprovalLink();
    approvalRead.data = [false, 0n, 0n, 0n, 0n, 0n];
    approvalRead.isPending = false;
    await rerender();

    // Approving through the dialog refetches the read, which now says approved.
    approvalRead.data = [true, 1n, 1n, 0n, 0n, 1n];
    await rerender();

    expect(dialog()).not.toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(approvalRead.enabled.at(-1)).toBe(false);
  });
});
