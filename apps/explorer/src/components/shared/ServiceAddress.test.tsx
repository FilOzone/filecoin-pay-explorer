// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExplorerLink from "./ExplorerLink";
import ServiceAddress from "./ServiceAddress";

const multicall = vi.hoisted(() => vi.fn());
vi.mock("@/services/viem/client", () => ({ getPublicClient: () => ({ multicall }) }));
vi.mock("@/hooks/useNetwork", () => ({
  default: () => ({ network: "mainnet", setNetwork: vi.fn(), subgraphUrl: "" }),
}));
vi.mock("./CopyButton", () => ({ default: ({ value }: { value: string }) => <button type='button'>{value}</button> }));

const OPERATOR = "0x1234567890abcdef1234567890abcdef12345678";
const STORACHA = "0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857";
const MARKER = "Self-reported on-chain name";

const ok = (result: string) => ({ status: "success", result });
const failed = { status: "failure", error: new Error("execution reverted") };

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
};

// The pre-load render already shows the fallback, so wait for the read's result to land. Testing Library's
// waitFor drains a macrotask once it passes, flushing the query's batched notification into the render.
const metadataSettled = (client: QueryClient) =>
  waitFor(() =>
    expect(client.getQueryCache().find({ queryKey: ["serviceMetadata"], exact: false })?.state.status).toBe("success"),
  );

const renderOperator = (value: string) =>
  renderWithClient(<ServiceAddress value={value} label='Operator address' truncate />);

// The element carrying the tooltip: the span wrapping the label.
const tooltipOf = (text: string) => screen.getByText(text).closest("[title]")?.getAttribute("title");

afterEach(() => {
  cleanup();
  multicall.mockReset();
});

describe("ServiceAddress", () => {
  it("marks an onchain name and puts it, the description, and the address in the tooltip", async () => {
    multicall.mockResolvedValue([ok("FCSS Validator"), ok("Validates deals"), failed]);
    renderOperator(OPERATOR);

    await screen.findByText("FCSS Validator");
    expect(screen.getByRole("img", { name: MARKER })).toBeTruthy();
    expect(screen.getByText("FCSS Validator").parentElement?.getAttribute("title")).toBe(
      `${MARKER}: FCSS Validator\nValidates deals\n${OPERATOR}`,
    );
    expect(screen.getByRole("button").textContent).toBe(OPERATOR);
  });

  it("falls back to the unmarked truncated address when the read fails", async () => {
    multicall.mockResolvedValue([failed, failed, failed]);
    const client = renderOperator(OPERATOR);

    await metadataSettled(client);
    expect(tooltipOf("0x123456...12345678")).toBe(OPERATOR);
    expect(screen.queryByRole("img", { name: MARKER })).toBeNull();
  });

  it("shows the description of a contract without a name", async () => {
    multicall.mockResolvedValue([failed, ok("Validates deals"), failed]);
    renderOperator(OPERATOR);

    await vi.waitFor(() => expect(tooltipOf("0x123456...12345678")).toBe(`Validates deals\n${OPERATOR}`));
  });

  it("drops the name and description of a contract impersonating a curated one", async () => {
    multicall.mockResolvedValue([ok("storacha"), ok("Official Storacha"), failed]);
    const client = renderOperator(OPERATOR);

    await metadataSettled(client);
    expect(screen.queryByText("storacha")).toBeNull();
    expect(tooltipOf("0x123456...12345678")).toBe(OPERATOR);
  });

  it("keeps the curated name, unmarked, with the contract's description", async () => {
    multicall.mockResolvedValue([ok("Impostor"), ok("Hot storage"), failed]);
    renderOperator(STORACHA);

    await vi.waitFor(() => expect(tooltipOf("Storacha")).toBe(`Hot storage\n${STORACHA}`));
    expect(screen.queryByText("Impostor")).toBeNull();
    expect(screen.queryByRole("img", { name: MARKER })).toBeNull();
  });
});

describe("ExplorerLink", () => {
  it("names the service and links its address to the block explorer", async () => {
    multicall.mockResolvedValue([ok("FCSS"), failed, failed]);
    renderWithClient(<ExplorerLink address={OPERATOR} label='Service address' />);

    await screen.findByText("FCSS");
    expect(screen.getByRole("link").getAttribute("href")).toBe(`https://filfox.info/en/address/${OPERATOR}`);
  });
});
