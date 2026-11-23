import { describe, expect, it } from "vitest";
import { isOrder, sameQuote } from "./session";

const quote = { paymentTotal: "5.00", feeTotal: "0.10", purchaseAmount: "4.900000" };
const base = "https://pay.coinbase.com/v2/api-onramp/apple-pay";
const query = "sessionToken=fixture&useApplePaySandbox=true";

describe("sandbox order restoration", () => {
  it("requires exactly one test-mode flag and a Coinbase session token on the trusted path", () => {
    const order = { orderId: "test", quote, paymentUrl: `${base}?${query}` };
    expect(isOrder(order)).toBe(true);
    expect(isOrder({ ...order, paymentUrl: `${base}?${query}&locale=en-US` })).toBe(true);
    for (const paymentUrl of [
      base,
      `${base}?sessionToken=fixture`,
      `${base}?${query}&sessionToken=second`,
      `${base}?${query}&useApplePaySandbox=false`,
      `${base}?${query}#fragment`,
      `${base}?${query}&redirect_url=https://other.example`,
      `https://other.example/?${query}`,
      `https://pay.coinbase.com/?${query}`,
      "invalid",
    ]) {
      expect(isOrder({ ...order, paymentUrl })).toBe(false);
    }
  });
  it("ignores precision-only changes but detects a one-unit difference in either priced output", () => {
    expect(sameQuote(quote, { ...quote, paymentTotal: "5", feeTotal: "0.1", purchaseAmount: "4.9" })).toBe(true);
    expect(sameQuote(quote, { ...quote, purchaseAmount: "4.899999" })).toBe(false);
    expect(sameQuote(quote, { ...quote, feeTotal: "0.11" })).toBe(false);
  });
});
