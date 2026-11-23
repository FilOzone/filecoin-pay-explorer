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
function receiptAmounts() {
  return Object.fromEntries(
    screen.getAllByRole("term").map((term) => [term.textContent?.trim(), term.nextElementSibling?.textContent?.trim()]),
  );
}

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
  vi.unstubAllEnvs();
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
    expect(receiptAmounts()).toEqual({
      "Minimum Filecoin Pay deposit": "4.187824 USDFC",
      "FIL for wallet network fees": "0.05 FIL",
      "Total charge": "$5.00",
      "Coinbase fees": "$0.12",
      "USDC delivered on Base": "4.863241 USDC",
      "Base gas and bridge fee budget": "Up to 0.5 USDC",
      "Base USDC to convert": "4.363241 USDC",
      "Bridge fee within the budget": "Up to 0.01 USDC",
      "USDFC budget for FIL": "0.036 USDFC",
    });
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
    expect(screen.queryByText("Example receipt")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh estimate" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls.map(([url]) => url)).toEqual(["/api/coinbase/quote", "/api/coinbase/quote"]);
    expect(route).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Other funding options" }));
    expect(otherMethods).toHaveBeenCalledOnce();
  });

  it("shows a read-only $5 example when the preview is unconfigured, including for cookie-based sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_COINBASE_PR_DEMO", "true");
    identity.mockResolvedValue(null);
    request.mockResolvedValue(Response.json({ code: "sandbox_unconfigured" }, { status: 503 }));
    const otherMethods = vi.fn();
    mount(otherMethods);
    await screen.findByText("Example receipt");
    expect(screen.getByRole("link", { name: "Try the $5 Apple Pay checkout" }).getAttribute("href")).toBe(
      `/sandbox/apple-pay?wallet=${wallet}`,
    );
    expect(screen.getByText(/figures illustrate a \$5 purchase/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("group", { name: "Preset amounts" })).toBeNull();
    expect(screen.queryByRole("button", { name: /pay with|verify/i })).toBeNull();
    fireEvent.click(screen.getByText("Example conversion details"));
    expect(receiptAmounts()).toEqual({
      "Illustrative Filecoin Pay deposit": "4.0875 USDFC",
      "FIL for wallet network fees": "0.05 FIL",
      "Total charge": "$5.00",
      "Coinbase fees": "$0.10",
      "USDC delivered on Base": "4.90 USDC",
      "Base gas and bridge fee budget": "Up to 0.5 USDC",
      "Base USDC to convert": "4.4 USDC",
      "Bridge fee within the budget": "Up to 0.01515 USDC",
      "USDFC budget for FIL": "0.3125 USDFC",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/coinbase/quote",
      expect.objectContaining({
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(request).toHaveBeenCalledOnce();
    expect(route).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Other funding options" }));
    expect(otherMethods).toHaveBeenCalledOnce();
  });

  it("keeps the example fixed at $5 after selecting $25 and retries live pricing for the chosen amount", async () => {
    mount();
    await screen.findByText(paymentBlocker);
    request.mockResolvedValueOnce(Response.json({ code: "sandbox_unconfigured" }, { status: 503 }));
    fireEvent.click(screen.getByRole("button", { name: "$25" }));
    await screen.findByText("Example receipt");
    expect(screen.getByText("$5.00")).toBeTruthy();
    expect(screen.queryByText("$25.00")).toBeNull();
    expect(screen.queryByText("4.863241 USDC")).toBeNull();
    expect(route).toHaveBeenCalledOnce();

    request.mockResolvedValueOnce(
      Response.json({ paymentTotal: "25.00", feeTotal: "0.20", purchaseAmount: "24.800000" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check live pricing" }));
    await screen.findByText(paymentBlocker);
    expect(screen.queryByText("Example receipt")).toBeNull();
    expect(screen.queryByText("4.90 USDC")).toBeNull();
    expect(screen.getByText("$25.00")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Purchase amount (USD)" }) as HTMLInputElement).value).toBe("25.00");
    expect(request.mock.calls.map(([url, init]) => [url, JSON.parse(init.body).paymentAmount])).toEqual([
      ["/api/coinbase/quote", "5.00"],
      ["/api/coinbase/quote", "25.00"],
      ["/api/coinbase/quote", "25.00"],
    ]);
    expect(route).toHaveBeenCalledTimes(2);
    expect(route).toHaveBeenLastCalledWith({ wallet, receivedUsdc: 24_800_000n });
  });

  it("keeps a sign-in error actionable even if the response carries the preview configuration code", async () => {
    const error = "Your sign-in could not be verified. Sign in again to check this estimate.";
    request.mockResolvedValueOnce(Response.json({ code: "sandbox_unconfigured", error }, { status: 401 }));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain(error);
    expect(screen.queryByText("Example receipt")).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  it("can quote with the browser's identity cookie when the SDK cannot supply a token", async () => {
    identity.mockRejectedValue(new Error("Identity unavailable"));
    mount();
    await screen.findByText(paymentBlocker);
    expect(request.mock.lastCall?.[1].headers).toEqual({ "Content-Type": "application/json" });
  });

  it("keeps the Coinbase quote when Squid cannot price the conversion", async () => {
    const error = "Squid could not quote a native FIL reserve for this purchase.";
    route.mockRejectedValueOnce(new Error(error));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain(error);
    expect(screen.getByText("4.863241 USDC")).toBeTruthy();
    expect(screen.queryByText("Example receipt")).toBeNull();
    expect(screen.queryByText("Minimum Filecoin Pay deposit")).toBeNull();
  });

  it("drops expired deposit terms while retaining the Coinbase estimate", async () => {
    route.mockResolvedValue({ ...routeEstimate, expiresAt: Date.now() - 1 });
    mount();
    await screen.findByText(/Squid estimate expired/);
    expect(screen.queryByText("Minimum Filecoin Pay deposit")).toBeNull();
    expect(screen.getByText("4.863241 USDC")).toBeTruthy();
  });
});
