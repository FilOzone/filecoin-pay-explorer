import { getAddress, isAddress, parseUnits, zeroAddress } from "viem";

export type GuestCoinbaseQuote = {
  paymentTotal: string;
  feeTotal: string;
  purchaseAmount: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cents(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d{1,3}(\.\d{1,2}0*)?$/.test(value) || value.length > 24) return null;
  return parseUnits(value, 2);
}

function dollars(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

export function parseQuoteInput(body: unknown) {
  if (!isRecord(body) || typeof body.address !== "string" || !isAddress(body.address) || body.address === zeroAddress) {
    return null;
  }
  const amount = cents(body.paymentAmount);
  if (amount === null || amount < 500n || amount > 5_000n) return null;
  return { address: getAddress(body.address), paymentAmount: dollars(amount) };
}

// An isQuote response has the same order envelope as a payable order. Only expose the estimate.
export function readQuote(
  result: unknown,
  input: NonNullable<ReturnType<typeof parseQuoteInput>>,
): GuestCoinbaseQuote | null {
  if (!isRecord(result) || !isRecord(result.order)) return null;
  const order = result.order;
  if (
    order.paymentCurrency !== "USD" ||
    order.paymentMethod !== "GUEST_CHECKOUT_APPLE_PAY" ||
    order.purchaseCurrency !== "USDC" ||
    order.destinationNetwork !== "base" ||
    typeof order.destinationAddress !== "string" ||
    order.destinationAddress.toLowerCase() !== input.address.toLowerCase() ||
    typeof order.purchaseAmount !== "string" ||
    !/^\d{1,3}(\.\d{1,6})?$/.test(order.purchaseAmount) ||
    parseUnits(order.purchaseAmount, 6) === 0n
  )
    return null;

  const total = cents(order.paymentTotal);
  const subtotal = cents(order.paymentSubtotal);
  if (
    total === null ||
    subtotal === null ||
    subtotal === 0n ||
    subtotal > total ||
    dollars(total) !== input.paymentAmount
  ) {
    return null;
  }
  return { paymentTotal: dollars(total), feeTotal: dollars(total - subtotal), purchaseAmount: order.purchaseAmount };
}
