"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import { useState } from "react";
import { erc20Abi, type Hex, parseAbi } from "viem";
import { useReadContracts } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { formatTokenAmount } from "@/components/UserConsole/FundsSection/utils/formatTokenAmount";
import { useFundingLaunch } from "@/components/UserConsole/providers/FundingLaunchContext";
import { getChain } from "@/constants/chains";
import { CONSOLE_TOKEN_PAGE_SIZE, useAccountTokens } from "@/hooks/useAccountDetails";
import type { Network } from "@/types";
import {
  accountBalanceAt,
  depositPrefill,
  type FundsOffer,
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

/**
 * The account's token records, only to fill in the Deposit dialog's token
 * picker; nothing the steps offer depends on them. Without one (an account
 * the index has not seen, or a failed read) the dialog opens on USDFC by address.
 */
function useDepositTokens(network: Network, account: Hex): { usdfc: UserToken | null; all: UserToken[] } {
  const { data } = useAccountTokens(account, 1, { networkOverride: network, pageSize: CONSOLE_TOKEN_PAGE_SIZE });
  const usdfc = getChain(network).contracts.usdfc.address.toLowerCase();
  const all = data?.userTokens ?? [];
  // Matched by contract address, so a look-alike symbol can't stand in.
  return { usdfc: all.find((token) => token.token.id.toLowerCase() === usdfc) ?? null, all };
}

interface FundsStepProps {
  number: number;
  network: Network;
  account: Hex;
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
export const FundsStep = ({ number, network, account, deposit, funds, missing, offer }: FundsStepProps) => {
  const { openAddFunds } = useFundingLaunch();
  const [depositOpen, setDepositOpen] = useState(false);
  const tokens = useDepositTokens(network, account);
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
        depositToken={tokens.usdfc}
        initialTokenAddress={getChain(network).contracts.usdfc.address}
        initialAmount={missing ? depositPrefill(missing) : null}
        tokens={tokens.all}
      />
    </SetupStep>
  );
};
