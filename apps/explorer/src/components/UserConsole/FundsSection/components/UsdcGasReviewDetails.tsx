import { formatUnits } from "viem";
import type { PaymasterDepositPlan } from "../data/paymaster-deposit-plan";

/** The review lines of a deposit whose Base gas and bridge fee are paid out of the USDC set aside. */
export function UsdcGasReviewDetails({
  nativeSymbol,
  plan,
  sourceDecimals,
  sourceSymbol,
}: {
  nativeSymbol: string;
  plan: PaymasterDepositPlan;
  sourceDecimals: number;
  sourceSymbol: string;
}) {
  return (
    <>
      <p>
        <span className='text-muted-foreground'>Deposit:</span> {formatUnits(plan.quote.sourceAmount, sourceDecimals)}{" "}
        {sourceSymbol}
      </p>
      <p>
        <span className='text-muted-foreground'>Network fee maximum:</span>{" "}
        {formatUnits(plan.gasMaximum, sourceDecimals)} {sourceSymbol}
        <span className='mt-1 block text-xs text-muted-foreground'>
          {`Paid in ${sourceSymbol} through Circle, including its fee of up to 10%. What is not used is refunded.`}
        </span>
      </p>
      {plan.maxSwapInput > 0n ? (
        <p>
          <span className='text-muted-foreground'>Bridge fee:</span> up to{" "}
          {formatUnits(plan.maxSwapInput, sourceDecimals)} {sourceSymbol}, swapped for {nativeSymbol}
        </p>
      ) : null}
    </>
  );
}
