"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import { useState } from "react";
import { erc20Abi, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { calculateFundedUntil } from "@/components/UserConsole/FundsSection/utils/calculateFundedUntil";
import { formatTokenAmount } from "@/components/UserConsole/FundsSection/utils/formatTokenAmount";
import { useFundingLaunch } from "@/components/UserConsole/providers/FundingLaunchContext";
import { getChain } from "@/constants/chains";
import { CONSOLE_TOKEN_PAGE_SIZE, useAccountTokens } from "@/hooks/useAccountDetails";
import type { Network } from "@/types";
import {
  depositPrefill,
  type FundsOffer,
  netDeposited,
  type Read,
  SETUP_POLL_MS,
  type Shortfall,
  shortfallLabel,
} from "./data/setupStatus";
import { SetupStep, type StepTone } from "./SetupStep";

export type AvailableFunds = Read<{
  available: bigint;
  /** Owed beyond the account's funds; `available` is 0 while there is any. */
  debt: bigint;
  /** Deposits minus withdrawals; see {@link netDeposited}. */
  netDeposited: bigint;
  userToken: UserToken | null;
  userTokens: UserToken[];
}>;

/** USDFC the account can spend now, as the dashboard's funds overview reckons it. */
export function useAvailableUsdfc(network: Network, account: Hex, enabled = true): AvailableFunds {
  const { data, dataUpdatedAt, isPending } = useAccountTokens(account, 1, {
    networkOverride: network,
    pageSize: CONSOLE_TOKEN_PAGE_SIZE,
    enabled,
    // Polled so a deposit made in another tab or by the tool shows up here too.
    refetchInterval: SETUP_POLL_MS,
  });
  if (isPending) return { state: "loading" };
  // A failed refetch keeps the last answer rather than reading as an empty account.
  if (!data) return { state: "unreadable" };
  const usdfc = getChain(network).contracts.usdfc.address.toLowerCase();
  // Matched by contract address, so a look-alike symbol can't stand in. An account the index has not seen has none.
  const userToken = data.userTokens.find((token) => token.token.id.toLowerCase() === usdfc) ?? null;
  // Reckoned at the last read: the poll moves it forward as lockup accrues.
  const funded = userToken ? calculateFundedUntil(userToken, BigInt(Math.floor(dataUpdatedAt / 1_000))) : null;
  return {
    state: "ready",
    available: funded?.availableFunds ?? 0n,
    debt: funded?.debt ?? 0n,
    netDeposited: netDeposited(userToken),
    userToken,
    userTokens: data.userTokens,
  };
}

export type WalletUsdfc = Read<{ balance: bigint }>;

/** USDFC in the wallet itself, which a deposit moves into Filecoin Pay. */
export function useWalletUsdfc(network: Network, account: Hex, enabled = true): WalletUsdfc {
  const chain = getChain(network);
  const { data, isPending } = useReadContract({
    address: chain.contracts.usdfc.address,
    abi: erc20Abi,
    chainId: chain.id,
    functionName: "balanceOf",
    args: [account],
    query: { enabled, refetchInterval: SETUP_POLL_MS },
  });
  if (isPending) return { state: "loading" };
  // As above: a failed refetch keeps the last balance.
  if (data === undefined) return { state: "unreadable" };
  return { state: "ready", balance: data };
}

const balanceStatus = (funds: AvailableFunds, done: boolean): { tone: StepTone; label: string } => {
  if (funds.state === "loading") return { tone: "waiting", label: "Checking" };
  if (funds.state === "unreadable") return { tone: "problem", label: "Could not read your balance" };
  return { tone: done ? "done" : "todo", label: `${formatTokenAmount(funds.available, 18)} USDFC available` };
};

function offerText(offer: FundsOffer, missing: Shortfall | null): string | null {
  const label = missing ? shortfallLabel(missing) : "USDFC";
  switch (offer) {
    case "with-approval":
      return `Approving Warm Storage above also deposits the ${label} from your wallet, in the same transaction.`;
    case "add-funds":
      return `Your wallet does not hold the ${label} still missing. Add funds gets USDFC and deposits it into Filecoin Pay.`;
    default:
      return null;
  }
}

interface FundsStepProps {
  number: number;
  network: Network;
  /** The amount to add the link names; null asks for a balance, or for some balance at all. */
  deposit: string | null;
  funds: AvailableFunds;
  /** null while the balance is still loading. */
  missing: Shortfall | null;
  offer: FundsOffer;
}

/**
 * Fund Filecoin Pay with what the request still lacks: the usual Add funds
 * flow when the wallet cannot make it up, or the Deposit dialog, opened on
 * USDFC and the shortfall, when it can. The Deposit dialog stays mounted
 * throughout, so a deposit in flight keeps its own lifecycle once it lands.
 */
export const FundsStep = ({ number, network, deposit, funds, missing, offer }: FundsStepProps) => {
  const { openAddFunds } = useFundingLaunch();
  const [depositOpen, setDepositOpen] = useState(false);
  const ready = funds.state === "ready" ? funds : null;
  const text = offerText(offer, missing);

  return (
    <SetupStep
      number={number}
      title='Fund Filecoin Pay'
      description={
        deposit
          ? `The tool needs ${deposit} USDFC more in Filecoin Pay. Storage is paid from that balance.`
          : "Storage is paid from your Filecoin Pay balance, so the tool needs some there to upload."
      }
      status={balanceStatus(funds, offer === "done")}
    >
      {text && <p className='text-sm text-muted-foreground'>{text}</p>}
      {offer === "add-funds" && (
        <Button variant='primary' size='compact' className='mt-3' onClick={() => openAddFunds()}>
          Add funds
        </Button>
      )}
      {offer === "deposit" && missing && (
        <Button variant='primary' size='compact' onClick={() => setDepositOpen(true)}>
          Deposit {shortfallLabel(missing)}
        </Button>
      )}
      <DepositDialog
        key={network}
        network={network}
        open={depositOpen}
        onOpenChange={setDepositOpen}
        depositToken={ready?.userToken ?? null}
        initialTokenAddress={getChain(network).contracts.usdfc.address}
        initialAmount={missing ? depositPrefill(missing) : null}
        tokens={ready?.userTokens ?? []}
      />
    </SetupStep>
  );
};
