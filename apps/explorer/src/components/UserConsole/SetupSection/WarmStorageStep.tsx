"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import clsx from "clsx";
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { useReadContract } from "wagmi";
import AddServiceDialog, { type AddServicePrefill } from "@/components/UserConsole/AddServiceDialog";
import { EPOCHS_PER_DAY } from "@/components/UserConsole/FundsSection/data/funding-runway";
import { formatTokenAmount } from "@/components/UserConsole/FundsSection/utils/formatTokenAmount";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { DEFAULT_MAX_LOCKUP_PERIOD } from "@/utils/constants";
import { resolveOperator } from "@/utils/depositParam";
import { isUnlimitedValue } from "@/utils/formatter";
import {
  type ApprovalState,
  approvalState,
  depositPrefill,
  limitShortfalls,
  type OperatorApprovalTerms,
  SETUP_POLL_MS,
  type Shortfall,
  shortfallLabel,
} from "./data/setupStatus";
import { RemoveLimitsDialog } from "./RemoveLimitsDialog";
import { SetupStep, type StepTone } from "./SetupStep";

export type WarmStorageApproval = {
  state: ApprovalState;
  terms: OperatorApprovalTerms | null;
  /** Reads the approval again, for a first read that failed. */
  retry: () => void;
};

/**
 * The account's Warm Storage approval, read from Filecoin Pay. With
 * `unlimitedRequired`, an approval with spending limits reads as "limited".
 */
export function useWarmStorageApproval(
  network: Network,
  account: Hex,
  unlimitedRequired: boolean,
): WarmStorageApproval {
  const chain = getChain(network);
  const { data, isPending, refetch } = useReadContract({
    address: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    chainId: chain.id,
    functionName: "operatorApprovals",
    args: [chain.contracts.usdfc.address, account, resolveOperator("fwss", network)],
    // Polled so an approval made in another tab or by the tool shows up here too.
    query: { refetchInterval: SETUP_POLL_MS },
  });
  const retry = () => void refetch();
  if (isPending) return { state: "loading", terms: null, retry };
  // A failed refetch keeps the last answer: dropping it would offer an approval over the owner's limits.
  if (!data) return { state: "unreadable", terms: null, retry };
  const [isApproved, rateAllowance, lockupAllowance, , , maxLockupPeriod] = data;
  const terms = { isApproved, rateAllowance, lockupAllowance, maxLockupPeriod };
  return { state: approvalState(terms, unlimitedRequired), terms, retry };
}

const APPROVAL_STATUS: Record<ApprovalState, { tone: StepTone; label: string }> = {
  loading: { tone: "waiting", label: "Checking" },
  unreadable: { tone: "problem", label: "Could not read the approval" },
  approved: { tone: "done", label: "Approved" },
  "not-approved": { tone: "todo", label: "Not approved" },
  limited: { tone: "problem", label: "Approved with limits" },
};

const formatAllowance = (value: bigint, suffix = "") =>
  isUnlimitedValue(value) ? "Unlimited" : `${formatTokenAmount(value, 18)} USDFC${suffix}`;
const formatPeriod = (epochs: bigint) => {
  if (isUnlimitedValue(epochs)) return "Unlimited";
  const days = epochs / EPOCHS_PER_DAY;
  return days === 1n ? "1 day" : `${days.toString()} days`;
};

/**
 * The owner's current limits beside what the tool needs, so the change is visible before the wallet asks.
 * Named as Add a Service names them where the owner set them.
 */
const LimitsTable = ({ terms }: { terms: OperatorApprovalTerms }) => {
  const short = limitShortfalls(terms);
  const rows = [
    {
      label: "Rate limit",
      yours: formatAllowance(terms.rateAllowance, " per epoch"),
      needed: "Unlimited",
      short: short.rate,
    },
    { label: "Reserve limit", yours: formatAllowance(terms.lockupAllowance), needed: "Unlimited", short: short.lockup },
    {
      label: "Max reserve period",
      yours: formatPeriod(terms.maxLockupPeriod),
      needed: `At least ${formatPeriod(DEFAULT_MAX_LOCKUP_PERIOD)}`,
      short: short.period,
    },
  ];
  return (
    <table className='w-full text-sm'>
      <thead>
        <tr className='text-left text-muted-foreground'>
          <th className='py-1.5 pr-4 font-normal'>Limit</th>
          <th className='py-1.5 pr-4 font-normal'>Yours</th>
          <th className='py-1.5 font-normal'>Needed</th>
        </tr>
      </thead>
      <tbody className='divide-y border-t'>
        {rows.map((row) => (
          <tr key={row.label}>
            <td className='py-1.5 pr-4'>{row.label}</td>
            <td className={clsx("py-1.5 pr-4", row.short && "font-medium text-amber-700 dark:text-amber-400")}>
              {row.yours}
              {/* The tone alone would not reach a screen reader. */}
              {row.short && <span className='sr-only'> (too low)</span>}
            </td>
            <td className='py-1.5'>{row.needed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

function description(state: ApprovalState, deposit: Shortfall | null): string {
  if (state === "limited") {
    return "The tool needs Warm Storage approved without spending limits before it can upload. Yours has limits.";
  }
  if (deposit) {
    return `One transaction approves Warm Storage to charge for your data sets and deposits ${shortfallLabel(deposit)} from your wallet into Filecoin Pay to pay for them.`;
  }
  return "Lets Filecoin Warm Storage open payment rails for your data sets and charge for storage, within the limits you set.";
}

interface WarmStorageStepProps {
  number: number;
  network: Network;
  account: Hex;
  approval: WarmStorageApproval;
  /**
   * What the approval also deposits from the wallet, in the same transaction;
   * null to approve alone. Set only while the wallet holds it (see `fundsOffer`).
   */
  deposit: Shortfall | null;
}

/**
 * Approve Warm Storage in Add a Service, filled in with Warm Storage, USDFC
 * and, when it also deposits, what Filecoin Pay still lacks. Never
 * offered once approved: the dialog's unlimited defaults would overwrite the
 * limits the owner set. Lifting those limits is its own confirmed step,
 * offered only when the link asks for unlimited.
 */
export const WarmStorageStep = ({ number, network, account, approval, deposit }: WarmStorageStepProps) => {
  const [open, setOpen] = useState(false);
  // Mounted on first open, not before: its service list is a subgraph scan this page never needs
  // until then. It then stays mounted, so a submission in flight keeps its own lifecycle.
  const [dialogMounted, setDialogMounted] = useState(false);
  const [removeLimitsOpen, setRemoveLimitsOpen] = useState(false);
  const amount = deposit ? depositPrefill(deposit) : "";
  // Stable across renders: the dialog applies its prefill whenever the object changes.
  const prefill = useMemo<AddServicePrefill>(
    () => ({
      token: getChain(network).contracts.usdfc.address,
      operator: resolveOperator("fwss", network),
      amount,
    }),
    [network, amount],
  );
  // Only once the chain says there is none: an approval that could not be read may already exist.
  const canApprove = approval.state === "not-approved";
  const approveLabel = deposit ? `Approve and deposit${amount ? ` ${amount} USDFC` : ""}` : "Approve Warm Storage";

  return (
    <SetupStep
      number={number}
      title='Approve Warm Storage'
      description={description(approval.state, deposit)}
      status={APPROVAL_STATUS[approval.state]}
    >
      {approval.state === "limited" && approval.terms && (
        <div className='flex flex-col gap-4'>
          <LimitsTable terms={approval.terms} />
          <Button variant='primary' size='compact' className='self-start' onClick={() => setRemoveLimitsOpen(true)}>
            Remove spending limits
          </Button>
        </div>
      )}
      {/* Mounted while there are terms to lift, so a submission in flight keeps its own lifecycle. */}
      {approval.terms && (
        <RemoveLimitsDialog
          network={network}
          account={account}
          current={approval.terms}
          open={removeLimitsOpen}
          onOpenChange={setRemoveLimitsOpen}
        />
      )}
      {approval.state === "unreadable" && (
        <Button variant='ghost' size='compact' onClick={approval.retry}>
          Could not read the approval. Retry
        </Button>
      )}
      {canApprove && (
        <Button
          variant='primary'
          size='compact'
          onClick={() => {
            setDialogMounted(true);
            setOpen(true);
          }}
        >
          {approveLabel}
        </Button>
      )}
      {dialogMounted && (
        <AddServiceDialog
          key={network}
          network={network}
          open={open}
          onOpenChange={setOpen}
          prefill={prefill}
          withoutDeposit={deposit === null}
        />
      )}
    </SetupStep>
  );
};
