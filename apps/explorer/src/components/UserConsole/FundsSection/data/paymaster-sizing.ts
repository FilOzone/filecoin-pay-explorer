/** Squid re-quotes are slow; the reserves barely move with the amount, so a third round almost never runs. */
const MAX_PAYMASTER_SIZING_ROUNDS = 3;

export interface PaymasterSizingQuotes<Route> {
  /** A Squid route depositing `amount`, and the native fee the batch must buy for it. */
  quoteRoute(amount: bigint): Promise<{ route: Route; nativeFee: bigint }>;
  /** Most USDC the exact-output swap may spend on `nativeFee`. */
  quoteSwapInput(nativeFee: bigint): Promise<bigint>;
  /** USDC gas maximum for the whole user operation built from this route. */
  estimateGasMaximum(route: Route): Promise<bigint>;
}

/** Deposits as much of `balance` as fits beside the swap cap and gas maximum of that deposit's own quote. */
export async function sizePaymasterDeposit<Route>(balance: bigint, quotes: PaymasterSizingQuotes<Route>) {
  let amount = balance;
  for (let round = 0; round < MAX_PAYMASTER_SIZING_ROUNDS; round += 1) {
    const { route, nativeFee } = await quotes.quoteRoute(amount);
    const maxSwapInput = await quotes.quoteSwapInput(nativeFee);
    const gasMaximum = await quotes.estimateGasMaximum(route);
    const available = balance - maxSwapInput - gasMaximum;
    // The swap cap and gas maximum alone use up the balance.
    if (available <= 0n) return { kind: "insufficient-usdc", reserved: maxSwapInput + gasMaximum } as const;
    if (amount <= available) return { kind: "sized", amount, route, nativeFee, maxSwapInput, gasMaximum } as const;
    amount = available;
  }
  // Each re-quote needed more reserve than the last; the user should refresh.
  return { kind: "not-converged" } as const;
}
