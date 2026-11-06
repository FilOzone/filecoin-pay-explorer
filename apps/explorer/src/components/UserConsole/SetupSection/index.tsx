"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ExternalTextLink } from "@filecoin-foundation/ui-filecoin/TextLink/ExternalTextLink";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useConnection, useSwitchChain } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { useConsoleNetwork } from "@/components/UserConsole/useConsoleNetwork";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { formatAddress } from "@/utils/formatter";
import { parseSetupLink, type SetupLinkError, type SetupRequest } from "@/utils/setupLink";
import { type AvailableFunds, DepositServiceStep, useSetupFunds, useWarmStorageApproval } from "./DepositServiceStep";
import {
  fundsOffer,
  isSetupComplete,
  readDepositBaseline,
  type Shortfall,
  shortfall,
  writeDepositBaseline,
} from "./data/setupStatus";
import { GroupKeyStep } from "./GroupKeyStep";
import { SessionKeyStep, useKeyGrant } from "./SessionKeyStep";

const LINK_ERROR_COPY: Record<SetupLinkError, string> = {
  "bad-checksum": "The session key address has an invalid checksum.",
  "not-an-address": "The request does not contain a valid session key address.",
  "no-network": "The request does not specify a supported network.",
  "no-scopes": "The request does not specify supported scopes.",
  "bad-deposit": "The requested deposit amount is invalid.",
  "bad-balance": "The requested balance is invalid.",
  "bad-operator": "This page cannot configure the requested storage service.",
  "bad-approval": "This page does not support the requested storage approval.",
  "pubkey-without-key": "The encryption request does not identify a recipient session key.",
  "bad-pubkey": "The recipient’s encryption public key is invalid.",
  "bad-pubkeysig": "The signature binding the encryption public key to the session key is missing or invalid.",
  "bad-node": "This request asks for partial encryption access. This page supports only whole group keys.",
};

const NetworkName = ({ network }: { network: Network }) => <span className='capitalize'>{network}</span>;

const Header = ({
  network,
  account,
  caution,
  sessionKey,
}: {
  network: Network;
  account: Hex | undefined;
  caution?: boolean;
  sessionKey?: boolean;
}) => (
  <header className='flex flex-col gap-3'>
    <h1 className='text-3xl font-medium tracking-tight text-balance'>Set up your Filecoin Storage</h1>
    <p className='max-w-prose text-muted-foreground'>
      Review this tool’s request for wallet{" "}
      {account ? (
        <span className='inline-flex items-baseline gap-0.5'>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex makes the tooltip trigger keyboard-focusable */}
              <span tabIndex={0} className='cursor-help font-mono'>
                {formatAddress(account)}
              </span>
            </TooltipTrigger>
            <TooltipContent side='top' className='font-mono'>
              {account}
            </TooltipContent>
          </Tooltip>
          <CopyButton value={account} tooltipText='Copy wallet address' successMessage='Address copied' />
        </span>
      ) : (
        "this wallet"
      )}{" "}
      on <NetworkName network={network} />.
    </p>
    {caution && (
      <p className='flex max-w-prose items-start gap-2 text-sm text-amber-800 dark:text-amber-300'>
        <ShieldAlert aria-hidden className='mt-0.5 size-4 shrink-0' />
        Continue only if you started this request and trust the tool.
        {sessionKey && " Compare the session key address below with the address in your terminal."} This page cannot
        verify who sent you this link.
      </p>
    )}
    <Link href='/console' className='text-sm underline'>
      Go to console
    </Link>
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
          Switch to <NetworkName network={requested} /> to continue
        </>
      }
      className='p-4'
    >
      <p className='mt-1'>
        Your wallet is on <NetworkName network={current} />. Permissions and balances are separate on each network.
      </p>
      <Button
        variant='primary'
        size='compact'
        className='mt-3'
        disabled={isPending}
        onClick={() => switchChain({ chainId: getChain(requested).id })}
      >
        {isPending ? (
          "Switching network…"
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
  const current = funds.state === "ready" ? funds.funds : null;
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
  // Nothing of a Grant is on chain, so only this visit knows one was made.
  const [groupKeyGranted, setGroupKeyGranted] = useState(false);
  const approval = useWarmStorageApproval(network, account, request.unlimitedApproval);
  // An approval-only link never shows funds, so it reads none.
  const { funds, wallet: walletUsdfc } = useSetupFunds(network, account, !request.approvalOnly);
  const depositBaseline = useDepositBaseline(network, account, request, funds);
  // What Filecoin Pay still lacks. A link with a deposit but no balance is measured from the
  // baseline, so nothing is offered until it is known: a deposit sent before the first good read
  // would otherwise become part of the baseline and be asked for again.
  const awaitingBaseline = request.deposit !== null && request.balance === null && depositBaseline === null;
  const liveMissing =
    funds.state === "loading" || awaitingBaseline
      ? null
      : shortfall({
          // An unreadable balance counts as empty: the steps offered then still work.
          available: funds.state === "ready" ? funds.available : 0n,
          debt: funds.state === "ready" ? funds.debt : 0n,
          funds: funds.state === "ready" ? funds.funds : 0n,
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
  const complete =
    (request.keyAgreement === null || groupKeyGranted) &&
    isSetupComplete({
      keyRequested: request.sessionKey !== null,
      grant,
      approved: approval.state === "approved",
      // An unreadable balance never reads as "none", so this needs no separate readiness check.
      fundsCovered: request.approvalOnly || missing?.kind === "none",
    });
  // The steps keep one order, whatever the reads say; only what each one offers changes.
  const offer = fundsOffer({ missing, walletUsdfc, approval: approval.state });
  // Deposit and Warm Storage are one step; the key steps follow it.

  return (
    <>
      <ol className='flex flex-col'>
        <DepositServiceStep
          number={1}
          network={network}
          account={account}
          approval={approval}
          // An approval-only link never shows funds or deposits.
          funds={request.approvalOnly ? null : funds}
          missing={missing}
          offer={offer}
        />
        {request.sessionKey && (
          <SessionKeyStep
            number={2}
            network={network}
            account={account}
            request={request.sessionKey}
            encryption={!!request.keyAgreement}
            grant={grant}
            onGranted={() => void refetchGrant()}
          />
        )}
        {request.sessionKey && request.keyAgreement && (
          <GroupKeyStep
            number={3}
            network={network}
            account={account}
            sessionKey={request.sessionKey.address}
            keyAgreement={request.keyAgreement}
            // The Grant's claim ends with the key's authorization, so it waits for one.
            expires={grant.state === "authorized" ? grant.expiresAt : null}
            onIssued={() => setGroupKeyGranted(true)}
          />
        )}
      </ol>

      {/* Mounted empty so screen readers announce the moment it fills. */}
      <div aria-live='polite'>
        {complete && (
          <Notice
            tone='ok'
            role='status'
            title={request.keyAgreement ? "Console steps complete — finish in your terminal" : "Console setup complete"}
            className='motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500'
          >
            <p className='mt-1'>
              {request.keyAgreement ? (
                <>
                  This package contains the group key encrypted for this session key; it starts with fgr1_. Import it
                  with your tool or set it as an environment variable for it. This user console does not save it: copy
                  it before leaving this page. It reveals the wallet address, session key address, group ID and expiry —
                  send it only where you intend to share those details. Read how to make encrypted uploads with the CLI
                  and SDK in the{" "}
                  <ExternalTextLink href='https://docs.filecoin.cloud/developer-guides/encryption/keysmith-encryption-keys/'>
                    encryption guide
                  </ExternalTextLink>
                  . Once you have imported it, you can close this window.
                </>
              ) : (
                "Return to your terminal; the command continues on its own. If it already exited, run it again. You can close this window."
              )}
            </p>
          </Notice>
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
            {LINK_ERROR_COPY[request.error]} This page has not submitted an approval for this request. Run the command
            again for a new link.
          </p>
        </Notice>
      </div>
    );
  }

  const requested = request.network ?? network;
  return (
    <div className='flex flex-col gap-8'>
      <Header network={requested} account={address} caution sessionKey={!!request.sessionKey} />
      {requested !== network ? (
        <SwitchNetwork requested={requested} current={network} />
      ) : (
        address && (
          // Keyed by the link too: moving to another setup link in this tab must not keep the
          // previous one's deposit baseline or reached funds.
          <SetupSteps key={`${network}:${address}:${query}`} network={network} account={address} request={request} />
        )
      )}
    </div>
  );
};

export default SetupSection;
