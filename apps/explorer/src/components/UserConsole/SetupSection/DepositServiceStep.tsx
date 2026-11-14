"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { erc20Abi, type Hex, parseAbi } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { Notice } from "@/components/shared/Notice";
import AddServiceDialog, { type AddServicePrefill } from "@/components/UserConsole/AddServiceDialog";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { EPOCHS_PER_DAY } from "@/components/UserConsole/FundsSection/data/funding-runway";
import { formatTokenAmount } from "@/components/UserConsole/FundsSection/utils/formatTokenAmount";
import { useFundingLaunch } from "@/components/UserConsole/providers/FundingLaunchContext";
import { getChain } from "@/constants/chains";
import { CONSOLE_TOKEN_PAGE_SIZE, useAccountTokens } from "@/hooks/useAccountDetails";
import type { Network } from "@/types";
import { DEFAULT_MAX_LOCKUP_PERIOD } from "@/utils/constants";
import { resolveOperator } from "@/utils/depositParam";
import { isUnlimitedValue } from "@/utils/formatter";
import {
  type ApprovalState,
  accountBalanceAt,
  approvalState,
  depositPrefill,
  type FundsOffer,
  limitShortfalls,
  type OperatorApprovalTerms,
  type Read,
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

export type AvailableFunds = Read<{
  available: bigint;
  /** Owed beyond the account's funds; `available` is 0 while there is any. */
  debt: bigint;
  /** The account's `funds`, deposits and all, before lockup; see `shortfall`. */
  funds: bigint;
}>;

export type WalletUsdfc = Read<{ balance: bigint }>;

/** Multicall3's block number, which viem's bundled Multicall3 ABI leaves out. */
const getBlockNumberAbi = parseAbi(["function getBlockNumber() view returns (uint256)"]);

/**
 * The account's USDFC in Filecoin Pay and in the wallet, in one read of the
 * chain at one block: the steps decide what to offer from live chain state,
 * as the approval and the key grant do, so a deposit counts as soon as its
 * receipt lands rather than once the subgraph has indexed it. Polled so a
 * deposit made in another tab or by the tool shows up here too.
 */
export function useSetupFunds(
  network: Network,
  account: Hex,
  enabled = true,
): { funds: AvailableFunds; wallet: WalletUsdfc } {
  const chain = getChain(network);
  const usdfc = chain.contracts.usdfc.address;
  const { data, isPending } = useReadContracts({
    contracts: [
      {
        address: chain.contracts.payments.address,
        abi: chain.contracts.payments.abi,
        chainId: chain.id,
        functionName: "accounts",
        args: [usdfc, account],
      },
      { address: usdfc, abi: erc20Abi, chainId: chain.id, functionName: "balanceOf", args: [account] },
      // The epoch the account is read at, to roll its lockup forward to.
      {
        address: chain.contracts.multicall3.address,
        abi: getBlockNumberAbi,
        chainId: chain.id,
        functionName: "getBlockNumber",
      },
    ],
    query: { enabled, refetchInterval: SETUP_POLL_MS },
  });
  if (isPending) return { funds: { state: "loading" }, wallet: { state: "loading" } };
  // A failed refetch keeps the last answer; only a read that never answered is unreadable.
  const [payAccount, walletBalance, block] = data ?? [];
  const wallet: WalletUsdfc =
    walletBalance?.status === "success" ? { state: "ready", balance: walletBalance.result } : { state: "unreadable" };
  if (payAccount?.status !== "success" || block?.status !== "success")
    return { funds: { state: "unreadable" }, wallet };
  const [funds, lockupCurrent, lockupRate, lockupLastSettledAt] = payAccount.result;
  return {
    funds: {
      state: "ready",
      funds,
      ...accountBalanceAt({ funds, lockupCurrent, lockupRate, lockupLastSettledAt }, block.result),
    },
    wallet,
  };
}

const APPROVAL_STATUS: Record<ApprovalState, { tone: StepTone; label: string }> = {
  loading: { tone: "waiting", label: "Checking" },
  unreadable: { tone: "problem", label: "Could not read the approval" },
  approved: { tone: "done", label: "Approved" },
  "not-approved": { tone: "todo", label: "Not approved" },
  limited: { tone: "problem", label: "Approved with limits" },
};

/**
 * One status line for both of the step's underlying states: the approval and
 * the available balance, e.g. "Approved · 2.729 USDFC available". A problem
 * with either read takes the whole line; an approval-only link reads no funds
 * and shows the approval alone.
 */
const stepStatus = (
  approval: ApprovalState,
  funds: AvailableFunds | null,
  done: boolean,
): { tone: StepTone; label: string } => {
  const about = APPROVAL_STATUS[approval];
  if (funds === null) return about;
  if (approval === "loading" || funds.state === "loading") return { tone: "waiting", label: "Checking" };
  if (approval === "unreadable" || approval === "limited") return about;
  if (funds.state === "unreadable")
    return { tone: "problem", label: "Could not check the available balance. Check it before depositing again." };
  return {
    tone: approval === "approved" && done ? "done" : "todo",
    label: `${about.label} · ${formatTokenAmount(funds.available, 18)} USDFC available`,
  };
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
      label: "Maximum storage charge rate",
      yours: formatAllowance(terms.rateAllowance, " per epoch"),
      needed: "Unlimited",
      short: short.rate,
    },
    {
      label: "Maximum funds reserved for storage",
      yours: formatAllowance(terms.lockupAllowance),
      needed: "Unlimited",
      short: short.lockup,
    },
    {
      label: "Maximum reservation period",
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
          <th className='py-1.5 pr-4 font-normal'>Current</th>
          <th className='py-1.5 font-normal'>Requested</th>
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

function description(state: ApprovalState): string {
  if (state === "limited") {
    return "This setup requires unlimited spending approval. Your current approval has limits. Review the change before removing them.";
  }
  return "Lets Warm Storage charge your Filecoin Pay account for the data sets you or your session keys create, and makes sure it holds what the tool needs.";
}

function approveLabel({
  checking,
  withDeposit,
  amount,
}: {
  checking: boolean;
  withDeposit: boolean;
  amount: string;
}): string {
  if (checking) return "Checking balance…";
  if (!withDeposit) return "Review storage approval";
  if (!amount) return "Review approval and deposit";
  return `Review approval and ${amount} USDFC deposit`;
}

/** The one line beside the actions; only the Add funds path needs explaining beyond the description. */
function offerText(offer: FundsOffer, missing: Shortfall | null, network: Network): string | null {
  if (offer !== "add-funds") return null;
  const label = missing ? shortfallLabel(missing) : "USDFC";
  return network === "calibration"
    ? `Your wallet does not hold the ${label} still missing. Get testnet USDFC before depositing it into your Filecoin Pay account.`
    : `Your wallet does not hold the ${label} still missing. Add funds gets USDFC and deposits it into your Filecoin Pay account.`;
}

/**
 * The account's token records, only to fill in the Deposit dialog's token
 * picker; nothing the step offers depends on them. Without one (an account
 * the index has not seen, or a failed read) the dialog opens on USDFC by address.
 */
function useDepositTokens(network: Network, account: Hex): { usdfc: UserToken | null; all: UserToken[] } {
  const { data } = useAccountTokens(account, 1, { networkOverride: network, pageSize: CONSOLE_TOKEN_PAGE_SIZE });
  const usdfc = getChain(network).contracts.usdfc.address.toLowerCase();
  const all = data?.userTokens ?? [];
  // Matched by contract address, so a look-alike symbol can't stand in.
  return { usdfc: all.find((token) => token.token.id.toLowerCase() === usdfc) ?? null, all };
}

/**
 * The deposit actions once Warm Storage is approved: the Deposit dialog,
 * opened on USDFC and the shortfall, when the wallet holds it; the usual Add
 * funds flow, which deposits into Filecoin Pay, when it does not. Mounted only
 * for a link that sets up funds, and the Deposit dialog stays mounted
 * throughout, so a deposit in flight keeps its own lifecycle once it lands.
 */
const DepositActions = ({
  network,
  account,
  missing,
  offer,
}: {
  network: Network;
  account: Hex;
  /** null while the balance is still loading. */
  missing: Shortfall | null;
  offer: FundsOffer;
}) => {
  const { openAddFunds } = useFundingLaunch();
  const [depositOpen, setDepositOpen] = useState(false);
  const tokens = useDepositTokens(network, account);

  return (
    <>
      {offer === "add-funds" && (
        <Button variant='primary' size='compact' onClick={() => openAddFunds()}>
          Add funds
        </Button>
      )}
      {offer === "deposit" && missing && (
        <Button variant='primary' size='compact' onClick={() => setDepositOpen(true)}>
          Review {shortfallLabel(missing)} deposit
        </Button>
      )}
      <DepositDialog
        key={network}
        network={network}
        open={depositOpen}
        onOpenChange={setDepositOpen}
        depositToken={tokens.usdfc}
        initialTokenAddress={getChain(network).contracts.usdfc.address}
        initialAmount={missing ? depositPrefill(missing) : null}
        tokens={tokens.all}
      />
    </>
  );
};

interface DepositServiceStepProps {
  number: number;
  network: Network;
  account: Hex;
  approval: WarmStorageApproval;
  /** null for an approval-only link, which reads no funds and deposits nothing. */
  funds: AvailableFunds | null;
  /** What Filecoin Pay still lacks; null while the balance is still loading. */
  missing: Shortfall | null;
  offer: FundsOffer;
}

/**
 * Deposit and add Warm Storage in one step, through the console's Deposit and
 * Add Service flow (Add a Service), filled in with Warm Storage, USDFC and,
 * while Warm Storage needs approving and the wallet holds the shortfall, the
 * amount it deposits in the same transaction. Once approved, only the funds
 * can be short: see {@link DepositActions}. Add a Service is never offered
 * again once approved: its unlimited defaults would overwrite the limits the
 * owner set. Lifting those limits is its own confirmed step, offered only when
 * the link asks for unlimited.
 */
export const DepositServiceStep = ({
  number,
  network,
  account,
  approval,
  funds,
  missing,
  offer,
}: DepositServiceStepProps) => {
  const [open, setOpen] = useState(false);
  // Mounted on first open, not before: its service list is a subgraph scan this page never needs
  // until then. It then stays mounted, so a submission in flight keeps its own lifecycle.
  const [dialogMounted, setDialogMounted] = useState(false);
  const [removeLimitsOpen, setRemoveLimitsOpen] = useState(false);
  // An approval-only link never deposits. A link without an amount still deposits in the approval, the owner typing it.
  const withDeposit = funds !== null && offer === "with-approval";
  const amount = withDeposit && missing ? depositPrefill(missing) : "";
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
  // Until the balance answers, whether the approval carries the deposit is unknown: a click would approve alone.
  // A failed read does not wait: the owner can still approve alone.
  const checking = funds !== null && funds.state === "loading";
  const text = funds !== null ? offerText(offer, missing, network) : null;

  return (
    <SetupStep
      number={number}
      title='Deposit and add Warm Storage'
      description={description(approval.state)}
      status={stepStatus(approval.state, funds, offer === "done")}
    >
      {approval.state === "limited" && approval.terms && (
        <div className='flex flex-col gap-4'>
          <LimitsTable terms={approval.terms} />
          <p className='text-sm text-muted-foreground'>
            These values are limits, not amounts currently charged or reserved. Funds actually reserved for storage
            payments are not available to withdraw while locked.
          </p>
          <Button variant='primary' size='compact' className='self-start' onClick={() => setRemoveLimitsOpen(true)}>
            Review removal of limits
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
        <Notice tone='error'>
          <p>Could not check Warm Storage approval. Retry before changing it.</p>
          <Button variant='ghost' size='compact' onClick={approval.retry}>
            Retry
          </Button>
        </Notice>
      )}
      {text && <p className='text-sm text-muted-foreground'>{text}</p>}
      <div className={clsx("flex flex-wrap gap-3", text && "mt-3")}>
        {canApprove && (
          <Button
            variant='primary'
            size='compact'
            disabled={checking}
            onClick={() => {
              setDialogMounted(true);
              setOpen(true);
            }}
          >
            {approveLabel({ checking, withDeposit, amount })}
          </Button>
        )}
        {funds !== null && <DepositActions network={network} account={account} missing={missing} offer={offer} />}
      </div>
      {dialogMounted && (
        <AddServiceDialog
          key={network}
          network={network}
          open={open}
          onOpenChange={setOpen}
          prefill={prefill}
          withoutDeposit={!withDeposit}
        />
      )}
    </SetupStep>
  );
};
