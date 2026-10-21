import { formatUnits } from "viem";
import { FEE_RESERVE_USDC } from "../data/paymaster-deposit-plan";

/** The review lines of a deposit whose Base gas and bridge fee are paid out of a USDC reserve. */
export function UsdcGasReviewDetails({
  depositAmount,
  sourceDecimals,
  sourceSymbol,
}: {
  depositAmount: bigint;
  sourceDecimals: number;
  sourceSymbol: string;
}) {
  return (
    <>
      <p>
        <span className='text-muted-foreground'>Deposit:</span> {formatUnits(depositAmount, sourceDecimals)}{" "}
        {sourceSymbol}
      </p>
      <p>
        <span className='text-muted-foreground'>Held for network fees:</span>{" "}
        {formatUnits(FEE_RESERVE_USDC, sourceDecimals)} {sourceSymbol}
        <span className='mt-1 block text-xs text-muted-foreground'>What is not used stays in your wallet balance.</span>
      </p>
    </>
  );
}
