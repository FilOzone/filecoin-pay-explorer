// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkContext } from "@/context/Network";
import CopyableText from "./CopyableText";

const multicall = vi.hoisted(() => vi.fn());
vi.mock("@/services/viem/client", () => ({ getPublicClient: () => ({ multicall }) }));
vi.mock("./CopyButton", () => ({ default: ({ value }: { value: string }) => <button type='button'>{value}</button> }));

const OPERATOR = "0x1234567890abcdef1234567890abcdef12345678";
const STORACHA = "0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857";
const MARKER = "Self-reported on-chain name";

const ok = (result: string) => ({ status: "success", result });
const failed = { status: "failure", error: new Error("execution reverted") };

const renderOperator = (value: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NetworkContext.Provider value={{ network: "mainnet", setNetwork: () => {}, subgraphUrl: "" }}>
      <QueryClientProvider client={client}>
        <CopyableText value={value} label='Operator address' truncate serviceMetadata />
      </QueryClientProvider>
    </NetworkContext.Provider>,
  );
};

// The element carrying the tooltip: the span wrapping the label.
const tooltipOf = (text: string) => screen.getByText(text).closest("[title]")?.getAttribute("title");

afterEach(() => {
  cleanup();
  multicall.mockReset();
});

describe("CopyableText with serviceMetadata", () => {
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
    renderOperator(OPERATOR);

    await vi.waitFor(() => expect(multicall).toHaveBeenCalled());
    expect(tooltipOf("0x1234...5678")).toBe(OPERATOR);
    expect(screen.queryByRole("img", { name: MARKER })).toBeNull();
  });

  it("shows the description of a contract without a name", async () => {
    multicall.mockResolvedValue([failed, ok("Validates deals"), failed]);
    renderOperator(OPERATOR);

    await vi.waitFor(() => expect(tooltipOf("0x1234...5678")).toBe(`Validates deals\n${OPERATOR}`));
  });

  it("drops the name and description of a contract impersonating a curated one", async () => {
    multicall.mockResolvedValue([ok("storacha"), ok("Official Storacha"), failed]);
    renderOperator(OPERATOR);

    await vi.waitFor(() => expect(multicall).toHaveBeenCalled());
    expect(screen.queryByText("storacha")).toBeNull();
    expect(tooltipOf("0x1234...5678")).toBe(OPERATOR);
  });

  it("keeps the curated name, unmarked, with the contract's description", async () => {
    multicall.mockResolvedValue([ok("Impostor"), ok("Hot storage"), failed]);
    renderOperator(STORACHA);

    await vi.waitFor(() => expect(tooltipOf("Storacha")).toBe(`Hot storage\n${STORACHA}`));
    expect(screen.queryByText("Impostor")).toBeNull();
    expect(screen.queryByRole("img", { name: MARKER })).toBeNull();
  });
});
