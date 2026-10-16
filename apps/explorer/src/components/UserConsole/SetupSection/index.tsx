"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useConnection, useSwitchChain } from "wagmi";
import { Notice } from "@/components/shared/Notice";
import { useConsoleNetwork } from "@/components/UserConsole/useConsoleNetwork";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { formatAddress } from "@/utils/formatter";
import { parseSetupLink, type SetupLinkError, type SetupRequest } from "@/utils/setupLink";
import {
  fundsOffer,
  isSetupComplete,
  readDepositBaseline,
  type Shortfall,
  shortfall,
  writeDepositBaseline,
} from "./data/setupStatus";
import { type AvailableFunds, FundsStep, useAvailableUsdfc, useWalletUsdfc } from "./FundsStep";
import { SessionKeyStep, useKeyGrant } from "./SessionKeyStep";
import { useWarmStorageApproval, WarmStorageStep } from "./WarmStorageStep";

const LINK_ERROR_COPY: Record<SetupLinkError, string> = {
  "bad-checksum": "The session key address in it is misspelled.",
  "not-an-address": "It does not contain a valid session key address.",
  "no-network": "It does not say which network it is for.",
  "no-scopes": "It does not say what the session key may do.",
  "bad-deposit": "Its deposit amount cannot be read.",
  "bad-balance": "The balance it asks for cannot be read.",
  "bad-operator": "It names a service this page does not set up.",
  "bad-approval": "It asks for a kind of Warm Storage approval this page does not know.",
};

const NetworkName = ({ network }: { network: Network }) => <span className='capitalize'>{network}</span>;

const Header = ({ network, account, caution }: { network: Network; account: Hex | undefined; caution?: boolean }) => (
  <header className='flex flex-col gap-3'>
    <h1 className='text-3xl font-medium tracking-tight text-balance'>Set up your wallet for storage</h1>
    <p className='max-w-prose text-muted-foreground'>
      A command-line tool asked to set up{" "}
      {account ? <span className='font-mono'>{formatAddress(account)}</span> : "this wallet"} on{" "}
      <NetworkName network={network} />. Each step is its own wallet transaction, and you can change what it asked for
      before you approve.
    </p>
    {caution && (
      <p className='flex max-w-prose items-start gap-2 text-sm text-amber-800 dark:text-amber-300'>
        <ShieldAlert aria-hidden className='mt-0.5 size-4 shrink-0' />
        Only continue if you started this yourself, for example by running a login command on your own computer. This
        page cannot tell who sent the link.
      </p>
    )}
  </header>
);

const SwitchNetwork = ({ requested, current }: { requested: Network; current: Network }) => {
  const { switchChain, isPending } = useSwitchChain();
  return (
    <Notice
      tone='warn'
      role='alert'
      title={
        <>
          This request is for <NetworkName network={requested} />
        </>
      }
      className='p-4'
    >
      <p className='mt-1'>
        Your wallet is on <NetworkName network={current} />. Nothing here applies until you switch: approving on the
        wrong network would set up a different account.
      </p>
      <Button
        variant='primary'
        size='compact'
        className='mt-3'
        disabled={isPending}
        onClick={() => switchChain({ chainId: getChain(requested).id })}
      >
        {isPending ? (
          "Switching…"
        ) : (
          <>
            Switch to <NetworkName network={requested} />
          </>
        )}
      </Button>
    </Notice>
  );
};

/**
 * For a link that names a deposit but no balance: what had gone into Filecoin
 * Pay when this tab first opened it, so the step can tell the deposit went in.
 * Kept in session storage, so a reload in this tab keeps it; another tab or
 * browser starts again from its own opening value. It is scoped to the link's
 * session key and expires (see {@link readDepositBaseline}), so a later request
 * for the same amount in this tab is not counted as done by an earlier deposit.
 * null until known, or when the link names a balance and needs none.
 */
function useDepositBaseline(network: Network, account: Hex, request: SetupRequest, funds: AvailableFunds) {
  const wanted = request.deposit !== null && request.balance === null && funds.state === "ready";
  const key = [
    "filecoin-pay-setup-deposit-baseline",
    network,
    account.toLowerCase(),
    request.sessionKey?.address.toLowerCase() ?? "no-key",
    request.deposit,
  ].join(":");
  const current = funds.state === "ready" ? funds.netDeposited : null;
  const [baseline, setBaseline] = useState<bigint | null>(null);
  useEffect(() => {
    if (!wanted || baseline !== null || current === null) return;
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(key);
    } catch {
      // Storage can be blocked; the baseline then lasts until this page closes.
    }
    const kept = readDepositBaseline(stored, Date.now());
    if (kept !== null) {
      setBaseline(kept);
      return;
    }
    try {
      window.sessionStorage.setItem(key, writeDepositBaseline(current, Date.now()));
    } catch {
      // As above.
    }
    setBaseline(current);
  }, [wanted, baseline, current, key]);
  return wanted ? baseline : null;
}

const SetupSteps = ({ network, account, request }: { network: Network; account: Hex; request: SetupRequest }) => {
  const { grant, refetch: refetchGrant } = useKeyGrant(network, account, request.sessionKey);
  const approval = useWarmStorageApproval(network, account, request.unlimitedApproval);
  // An approval-only link never shows funds, so it reads none.
  const funds = useAvailableUsdfc(network, account, !request.approvalOnly);
  const walletUsdfc = useWalletUsdfc(network, account, !request.approvalOnly);
  const depositBaseline = useDepositBaseline(network, account, request, funds);
  // Live, unlike the steps' order: what Filecoin Pay still lacks, and whether the wallet can make it up.
  const liveMissing =
    funds.state === "loading"
      ? null
      : shortfall({
          // An unreadable balance counts as empty: the steps offered then still work.
          available: funds.state === "ready" ? funds.available : 0n,
          netDeposited: funds.state === "ready" ? funds.netDeposited : 0n,
          baseline: depositBaseline,
          deposit: request.deposit,
          balance: request.balance,
        });
  // Once Filecoin Pay holds what the link asked for, the funds stay counted for this visit:
  // lockup keeps drawing the balance down, and a step that reopened a cent short would
  // take back "Setup complete" while the tool carries on. A reload checks again.
  const [fundsReached, setFundsReached] = useState(false);
  useEffect(() => {
    if (funds.state === "ready" && liveMissing?.kind === "none") setFundsReached(true);
  }, [funds.state, liveMissing?.kind]);
  const missing: Shortfall | null = fundsReached ? { kind: "none" } : liveMissing;
  const complete = isSetupComplete({
    keyRequested: request.sessionKey !== null,
    grant,
    approved: approval.state === "approved",
    // An unreadable balance never reads as "none", so this needs no separate readiness check.
    fundsCovered: request.approvalOnly || missing?.kind === "none",
  });
  // The steps keep one order, whatever the reads say; only what each one offers changes.
  const offer = fundsOffer({ missing, walletUsdfc, approval: approval.state });
  const first = request.sessionKey ? 2 : 1;

  return (
    <>
      <ol className='flex flex-col'>
        {request.sessionKey && (
          <SessionKeyStep
            number={1}
            network={network}
            account={account}
            request={request.sessionKey}
            grant={grant}
            onGranted={() => void refetchGrant()}
          />
        )}
        <WarmStorageStep
          number={first}
          network={network}
          account={account}
          approval={approval}
          // An approval-only link never deposits.
          deposit={!request.approvalOnly && offer === "with-approval" ? missing : null}
        />
        {!request.approvalOnly && (
          <FundsStep
            number={first + 1}
            network={network}
            deposit={request.deposit}
            funds={funds}
            missing={missing}
            offer={offer}
          />
        )}
      </ol>

      {/* Mounted empty so screen readers announce the moment it fills. */}
      <div aria-live='polite'>
        {complete && (
          <section className='rounded-xl bg-zinc-950 px-5 py-4 font-mono text-sm text-zinc-100 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 dark:bg-zinc-900'>
            <h2 className='text-green-400'>✓ Setup complete</h2>
            <p className='mt-2 text-zinc-300'>
              Go back to your terminal. A command that is still waiting carries on by itself; otherwise run it again.
            </p>
          </section>
        )}
      </div>
    </>
  );
};

/**
 * The page a CLI link opens: one request to set up the connected wallet,
 * shown as the steps it needs with each one's live status. The link stays in
 * the address bar, and since every status is read from the chain, reloading
 * it only shows what is already done.
 */
const SetupSection = ({ query }: { query: string }) => {
  const { address } = useConnection();
  const { network } = useConsoleNetwork();
  const request = useMemo(() => parseSetupLink(new URLSearchParams(query)), [query]);

  if ("error" in request) {
    return (
      <div className='flex flex-col gap-8'>
        <Header network={network} account={address} />
        <Notice tone='error' role='alert' title='This setup link cannot be used' className='p-4'>
          <p className='mt-1'>
            {LINK_ERROR_COPY[request.error]} Nothing was changed. Run the command again for a new link.
          </p>
        </Notice>
      </div>
    );
  }

  const requested = request.network ?? network;
  return (
    <div className='flex flex-col gap-8'>
      <Header network={requested} account={address} caution={requested === network} />
      {requested !== network ? (
        <SwitchNetwork requested={requested} current={network} />
      ) : (
        address && <SetupSteps key={`${network}:${address}`} network={network} account={address} request={request} />
      )}
    </div>
  );
};

export default SetupSection;
