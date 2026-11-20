// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuestCheckoutDialog from "./GuestCheckoutDialog";

const { identity, route } = vi.hoisted(() => ({ identity: vi.fn(), route: vi.fn() }));
vi.mock("@privy-io/react-auth", () => ({ getIdentityToken: identity }));
vi.mock("../data/guestRoute", () => ({ getGuestRouteEstimate: route }));

const wallet = "0x0000000000000000000000000000000000001234";
const quote = { paymentTotal: "5.00", feeTotal: "0.12", purchaseAmount: "4.863241" };
const paymentBlocker = "Base gas coverage for this wallet cannot be verified before payment.";
const routeEstimate = {
  quoteId: "quote-1",
  sourceSpendUsdc: 4363241n,
  networkReserveUsdc: 500000n,
  bridgeFeeUsdc: 10_000n,
  filSpendUsdfc: 36_000_000_000_000_000n,
  minimumDepositUsdfc: 4_187_824_000_123_456_789n,
  minimumFil: 50_000_000_000_000_000n,
  paymentBlocker,
};
const request = vi.fn();
function mount(onOtherMethods = vi.fn()) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <GuestCheckoutDialog address={wallet} onClose={vi.fn()} onOtherMethods={onOtherMethods} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  identity.mockResolvedValue("test-identity");
  request.mockImplementation(async () => Response.json(quote));
  route.mockResolvedValue({ ...routeEstimate, expiresAt: Date.now() + 30_000 });
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Coinbase guest estimate", () => {
  it("previews the actual $5 terms for the embedded wallet before offering verification or payment", async () => {
    mount();
    await screen.findByText(paymentBlocker);
    expect(request).toHaveBeenCalledWith(
      "/api/coinbase/quote",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: wallet, paymentAmount: "5.00" }),
        headers: expect.objectContaining({ Authorization: "Bearer test-identity" }),
      }),
    );
    expect(route).toHaveBeenCalledWith({ wallet, receivedUsdc: 4863241n });
    const breakdown = screen.getByText("Conversion details");
    expect(breakdown.closest("details")?.open).toBe(false);
    fireEvent.click(breakdown);
    expect(breakdown.closest("details")?.open).toBe(true);
    expect(screen.getAllByRole("definition").map((row) => row.textContent)).toEqual([
      "4.187824 USDFC",
      "0.05 FIL",
      "$5.00",
      "$0.12",
      "4.863241 USDC",
      "Up to 0.5 USDC",
      "4.363241 USDC",
      "Up to 0.01 USDC",
      "0.036 USDFC",
    ]);
    expect(screen.queryByRole("button", { name: /Pay with|Verify/i })).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("clears stale proceeds on amount changes and only requests in-range cents", async () => {
    mount();
    await screen.findByText(paymentBlocker);
    const field = screen.getByRole("textbox", { name: "Purchase amount (USD)" });
    fireEvent.change(field, { target: { value: "4.99" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Minimum Filecoin Pay deposit")).toBeNull();
    fireEvent.change(field, { target: { value: "50.01" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(field, { target: { value: "49.99" } });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(request.mock.lastCall?.[1].body)).toEqual({ address: wallet, paymentAmount: "49.99" });
  });

  it("requests new terms for the chosen preset and keeps the amount editable", async () => {
    mount();
    await screen.findByText(paymentBlocker);
    expect(screen.getByRole("button", { name: "$5", pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "$25" }));
    expect((screen.getByRole("textbox", { name: "Purchase amount (USD)" }) as HTMLInputElement).value).toBe("25.00");
    expect(screen.getByRole("button", { name: "$25", pressed: true })).toBeTruthy();
    expect(screen.queryByText("Minimum Filecoin Pay deposit")).toBeNull();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(request.mock.lastCall?.[1].body)).toEqual({ address: wallet, paymentAmount: "25.00" });
  });

  it("shows the quote blocker and lets the user leave without creating an order", async () => {
    request.mockImplementation(async () => Response.json({ error: "Sandbox quotes unavailable." }, { status: 503 }));
    const otherMethods = vi.fn();
    mount(otherMethods);
    await screen.findByText(/Apple Pay estimates are unavailable right now/);
    fireEvent.click(screen.getByRole("button", { name: "Refresh estimate" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls.map(([url]) => url)).toEqual(["/api/coinbase/quote", "/api/coinbase/quote"]);
    expect(route).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Other funding options" }));
    expect(otherMethods).toHaveBeenCalledOnce();
  });

  it("drops expired deposit terms while retaining the Coinbase estimate", async () => {
    route.mockResolvedValue({ ...routeEstimate, expiresAt: Date.now() - 1 });
    mount();
    await screen.findByText(/Squid estimate expired/);
    expect(screen.queryByText("Minimum Filecoin Pay deposit")).toBeNull();
    expect(screen.getByText("4.863241 USDC")).toBeTruthy();
  });
});
