"use client";

import { Card } from "@filecoin-pay/ui/components/card";
import Link from "next/link";
import { useConnection } from "wagmi";
import { useAccountApprovals } from "@/hooks/useAccountDetails";
import useSynapse from "@/hooks/useSynapse";
import { UNLIMITED_THRESHOLD } from "@/utils/constants";
import { formatTokenTruncated } from "@/utils/formatter";
import { getNetworkFromChainId } from "@/utils/network";
import { EPOCHS_PER_MONTH } from "@/utils/railRollup";

const TOKEN_DECIMALS = 18;

const limitDisplay = (allowance: bigint, perMonth: boolean): string => {
  if (allowance >= UNLIMITED_THRESHOLD) return "Unlimited";
  const value = perMonth ? allowance * EPOCHS_PER_MONTH : allowance;
  return `${formatTokenTruncated(value, TOKEN_DECIMALS, "USDFC")}${perMonth ? " / month" : ""}`;
};

/**
 * What this wallet lets the service operator do with its deposit — real
 * operatorApprovals from the subgraph. Read-only here: the approve/increase/
 * decrease transactions stay on the Dashboard so there is exactly one tx path.
 */
export const SpendingLimits = () => {
  const { address, chainId } = useConnection();
  const network = getNetworkFromChainId(chainId);
  const { constants } = useSynapse();
  const fwssAddress = constants.chain.contracts.fwss.address.toLowerCase();

  const { data } = useAccountApprovals(address?.toLowerCase() ?? "", 1, { networkOverride: network });
  const approval = data?.operatorApprovals.find((a) => a.operator.address.toLowerCase() === fwssAddress);
  if (!approval) return null;

  const rows = [
    {
      label: "Reserve limit",
      value: limitDisplay(BigInt(approval.lockupAllowance), false),
      used: `${formatTokenTruncated(BigInt(approval.lockupUsage), TOKEN_DECIMALS, "USDFC")} reserved`,
    },
    {
      label: "Spend rate limit",
      value: limitDisplay(BigInt(approval.rateAllowance), true),
      used: `${formatTokenTruncated(BigInt(approval.rateUsage) * EPOCHS_PER_MONTH, TOKEN_DECIMALS, "USDFC")} / month in use`,
    },
  ];

  return (
    <Card className='flex flex-col gap-3 p-4'>
      <h3 className='font-medium'>Spending limits</h3>
      <table className='text-sm'>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className='border-b last:border-b-0'>
              <td className='py-2 text-muted-foreground'>{row.label}</td>
              <td className='py-2 font-medium tabular-nums'>{row.value}</td>
              <td className='py-2 text-right text-xs text-muted-foreground tabular-nums'>{row.used}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className='text-xs text-muted-foreground'>
        Manage limits from the{" "}
        <Link href='/console' className='text-primary hover:underline'>
          Dashboard
        </Link>{" "}
        · full payment history and transaction details live in the{" "}
        {/* Prefilled deep link into this wallet's explorer account page. */}
        <Link href={`/${network}/accounts/${address}`} className='text-primary hover:underline'>
          Pay Explorer
        </Link>
      </p>
    </Card>
  );
};
