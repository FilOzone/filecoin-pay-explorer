// @vitest-environment jsdom
import type { Account } from "@filecoin-pay/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountOverview } from "./AccountOverview";

const multicall = vi.hoisted(() => vi.fn());
vi.mock("@/services/viem/client", () => ({ getPublicClient: () => ({ multicall }) }));
vi.mock("@/hooks/useNetwork", () => ({
  default: () => ({ network: "mainnet", setNetwork: vi.fn(), subgraphUrl: "" }),
}));
vi.mock("@/components/shared/CopyButton", () => ({
  default: ({ value }: { value: string }) => <button type='button'>{value}</button>,
}));
vi.mock("@/components/shared", async () => ({
  CopyableText: (await import("@/components/shared/CopyableText")).default,
  CopyButton: (await import("@/components/shared/CopyButton")).default,
  MetricItem: (await import("@/components/shared/MetricItem")).default,
}));

const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";
const DEALBOT = "0x305025d07c1dee47f25a4990179eff2becddca0b";
const MARKER = "Self-reported on-chain name";

const ok = (result: string) => ({ status: "success", result });
const failed = { status: "failure", error: new Error("execution reverted") };

const account = (address: string) =>
  ({ address, totalRails: 0n, totalTokens: 0n, totalApprovals: 0n }) as unknown as Account;

const renderOverview = (address: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AccountOverview account={account(address)} />
    </QueryClientProvider>,
  );
  return client;
};

// The pre-load render already shows the fallback, so wait for the read's result to land.
const metadataSettled = (client: QueryClient) =>
  waitFor(() =>
    expect(client.getQueryCache().find({ queryKey: ["serviceMetadata"], exact: false })?.state.status).toBe("success"),
  );

const heading = () => screen.getByRole("heading", { level: 3 });
// The heading's copy button; the "Account Address" card below has its own.
const copyButton = () => heading().nextElementSibling as HTMLElement;

afterEach(() => {
  cleanup();
  multicall.mockReset();
});

describe("AccountOverview heading", () => {
  it("shows the onchain name with the marker, only the address on hover, and copies the address", async () => {
    multicall.mockResolvedValue([ok("FCSS Validator"), ok("Validates deals"), failed]);
    renderOverview(ACCOUNT);

    await within(heading()).findByText("FCSS Validator");
    expect(within(heading()).getByRole("img", { name: MARKER })).toBeTruthy();
    expect(heading().getAttribute("title")).toBe(ACCOUNT);
    expect(copyButton().textContent).toBe(ACCOUNT);
  });

  it("shows the curated name of a known address, unmarked", async () => {
    multicall.mockResolvedValue([ok("Impostor"), failed, failed]);
    const client = renderOverview(DEALBOT);

    await metadataSettled(client);
    expect(heading().textContent).toBe("DealBot");
    expect(heading().getAttribute("title")).toBe(DEALBOT);
    expect(screen.queryByRole("img", { name: MARKER })).toBeNull();
  });

  it("shows the full address when the read fails", async () => {
    multicall.mockResolvedValue([failed, failed, failed]);
    const client = renderOverview(ACCOUNT);

    await metadataSettled(client);
    expect(heading().textContent).toBe(ACCOUNT);
    expect(heading().getAttribute("title")).toBe(ACCOUNT);
    expect(screen.queryByRole("img", { name: MARKER })).toBeNull();
    expect(copyButton().textContent).toBe(ACCOUNT);
  });
});
