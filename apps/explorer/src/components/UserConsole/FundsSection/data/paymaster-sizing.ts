/** Squid re-quotes are slow; the reserves barely move with the amount, so a third round almost never runs. */
export const MAX_PAYMASTER_SIZING_ROUNDS = 3;

export interface PaymasterSizingCandidate<Route> {
  amount: bigint;
  route: Route;
  /** Most USDC the exact-output swap may spend on the route's native fee; 0 when the fee is 0. */
  maxSwapInput: bigint;
}

export interface PaymasterSizingQuotes<Route> {
  /** A Squid route depositing `amount`; its `transaction.value` is the native fee the batch must buy. */
  quoteRoute(amount: bigint): Promise<Route>;
  quoteSwapInput(nativeFee: bigint): Promise<bigint>;
  /** USDC gas maximum for the whole user operation built from this candidate. */
  estimateGasMaximum(candidate: PaymasterSizingCandidate<Route>): Promise<bigint>;
}

export type PaymasterSizing<Route> =
  | ({ kind: "sized"; gasMaximum: bigint } & PaymasterSizingCandidate<Route>)
  /** The swap cap and gas maximum alone use up the balance. */
  | { kind: "insufficient-usdc"; reserved: bigint }
  /** Each re-quote needed more reserve than the last; the user should refresh. */
  | { kind: "not-converged" };

/**
 * Deposits as much of `balance` as fits once the swap cap and gas maximum are set aside. The route is
 * quoted first at the whole balance, then re-quoted at what the reserves leave, until a quote's own
 * reserves fit beside its amount.
 */
export async function sizePaymasterDeposit<Route extends { transaction: { value: bigint } }>(
  balance: bigint,
  quotes: PaymasterSizingQuotes<Route>,
): Promise<PaymasterSizing<Route>> {
  let amount = balance;
  for (let round = 0; round < MAX_PAYMASTER_SIZING_ROUNDS; round += 1) {
    const route = await quotes.quoteRoute(amount);
    const nativeFee = route.transaction.value;
    const maxSwapInput = nativeFee === 0n ? 0n : await quotes.quoteSwapInput(nativeFee);
    const gasMaximum = await quotes.estimateGasMaximum({ amount, maxSwapInput, route });
    const available = balance - maxSwapInput - gasMaximum;
    if (available <= 0n) return { kind: "insufficient-usdc", reserved: maxSwapInput + gasMaximum };
    if (amount <= available) return { amount, gasMaximum, kind: "sized", maxSwapInput, route };
    amount = available;
  }
  return { kind: "not-converged" };
}
