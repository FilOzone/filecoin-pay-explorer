"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { KEYSPACE_ID_KEY } from "@filoz/keysmith";
import { paginate } from "@filoz/synapse-core";
import { getPdpDataSets } from "@filoz/synapse-core/warm-storage";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Hex, WalletClient } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { formatDateTime } from "@/utils/formatter";
import { chooseGroupKey, type GroupKeyDataSet, issueGroupKeyGrant } from "@/utils/groupKeyGrant";
import { waitForPrivyModalToClose } from "@/utils/privy-modal";
import { type KeyAgreementRequest, verifyKeyAgreementKey } from "@/utils/setupLink";
import { type ChosenGroupKey, type GroupKeyPhase, groupKeyPhase } from "./data/setupStatus";
import { SetupStep, type StepTone } from "./SetupStep";

export const GROUP_KEY_WARNING =
  "This gives the session key permanent read access to everything in this group key, including future uploads. Expiry and revoking the session key do not take it back.";

/**
 * Which group key the owner's live data sets settle on, by the rule shared with
 * filecoin-pin. Reads every data set the owner pays for, a page at a time, and
 * keeps only those that record a group key. Read once per page load, since the
 * scan is O(data sets) and the group key shown must be the one signed for: a
 * remount, or another setup link opened in this tab within the query cache's
 * lifetime, reuses the result.
 */
function useGroupKeyChoice(network: Network, owner: Hex, enabled: boolean) {
  const client = usePublicClient({ chainId: getChain(network).id });
  return useQuery({
    queryKey: ["group-key-choice", network, owner.toLowerCase()],
    enabled: enabled && !!client,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!client) throw new Error("No client for this network");
      const tagged: GroupKeyDataSet[] = [];
      for await (const dataSet of paginate(({ cursor }) => getPdpDataSets(client, { address: owner, cursor }))) {
        if (dataSet.live && typeof dataSet.metadata[KEYSPACE_ID_KEY] === "string") {
          tagged.push({ dataSetId: dataSet.dataSetId, metadata: dataSet.metadata });
        }
      }
      return chooseGroupKey(owner, tagged);
    },
  });
}

const GROUP_KEY_STATUS: Record<GroupKeyPhase["phase"], { tone: StepTone; label: string }> = {
  issued: { tone: "done", label: "Grant ready" },
  "unsigned-pubkey": { tone: "problem", label: "Key not signed by the session key" },
  "checking-pubkey": { tone: "waiting", label: "Checking the session key" },
  "waiting-for-key": { tone: "todo", label: "Waiting for the session key" },
  "read-failed": { tone: "problem", label: "Could not read your data sets" },
  "inconsistent-default": { tone: "problem", label: "Could not choose a group key" },
  choosing: { tone: "waiting", label: "Finding your group key" },
  "connecting-wallet": { tone: "waiting", label: "Connecting to your wallet" },
  signing: { tone: "waiting", label: "Waiting for your wallet" },
  "sign-failed": { tone: "problem", label: "No Grant was made" },
  ready: { tone: "todo", label: "Not given" },
};

const SIGN = "Sign and create Grant";

/** The sign button in each phase; null where the step offers no signing at all. */
const SIGN_ACTION: Record<GroupKeyPhase["phase"], { label: string; enabled: boolean } | null> = {
  issued: null,
  "unsigned-pubkey": null,
  "checking-pubkey": { label: SIGN, enabled: false },
  "waiting-for-key": { label: SIGN, enabled: false },
  "read-failed": { label: SIGN, enabled: false },
  "inconsistent-default": { label: SIGN, enabled: false },
  choosing: { label: SIGN, enabled: false },
  // useWalletClient resolves after a connect or chain switch; until then nothing can sign.
  "connecting-wallet": { label: "Connecting to your wallet…", enabled: false },
  signing: { label: "Waiting for your wallet…", enabled: false },
  "sign-failed": { label: SIGN, enabled: true },
  ready: { label: SIGN, enabled: true },
};

/** The one notice a phase shows, if any. */
const GroupKeyNotice = ({ phase, onRetryRead }: { phase: GroupKeyPhase; onRetryRead: () => void }) => {
  switch (phase.phase) {
    case "unsigned-pubkey":
      return (
        <Notice tone='error' role='alert' title='The session key did not sign this encryption key' className='mt-4'>
          <p className='mt-1 text-xs'>
            The Grant could go to someone other than the session key above, so this page will not make it. Run the
            command again for a new link.
          </p>
        </Notice>
      );
    case "waiting-for-key":
      return (
        <p className='mt-4 text-sm text-muted-foreground'>
          Authorize the session key first: the Grant's fetching ends when its authorization does.
        </p>
      );
    case "read-failed":
      return (
        <Notice tone='error' role='alert' title='Could not read your data sets' className='mt-4'>
          <Button variant='ghost' size='compact' className='mt-2' onClick={onRetryRead}>
            Retry
          </Button>
        </Notice>
      );
    case "inconsistent-default":
      return (
        <Notice tone='error' role='alert' title='Your default group key is in an inconsistent state' className='mt-4'>
          <p className='mt-1 text-xs'>
            Data sets {phase.dataSetIds.join(", ")} use group key {phase.groupKeyId} but disagree on its commitment or
            encryption version, so this page will not sign for it.
          </p>
        </Notice>
      );
    case "sign-failed":
      return (
        <Notice tone='error' role='alert' title='No Grant was made' className='mt-4'>
          <p className='mt-1 text-xs break-words'>{phase.message}</p>
        </Notice>
      );
    case "issued":
    case "checking-pubkey":
    case "choosing":
    case "connecting-wallet":
    case "signing":
    case "ready":
      return null;
    default:
      return phase satisfies never;
  }
};

const GrantOutput = ({ grant }: { grant: string }) => (
  <div className='mt-4 flex flex-col gap-2'>
    <label htmlFor='group-key-grant' className='text-sm font-medium'>
      Grant
    </label>
    <div className='flex items-start gap-2'>
      <textarea
        id='group-key-grant'
        readOnly
        rows={4}
        value={grant}
        className='min-w-0 flex-1 resize-none rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all'
      />
      <CopyButton value={grant} tooltipText='Copy Grant' successMessage='Grant copied' />
    </div>
    <p className='text-sm text-muted-foreground'>
      Paste it at the login prompt, or run{" "}
      <code className='font-mono text-xs text-foreground'>filecoin-pin login --grant &lt;grant&gt;</code>. It is safe to
      paste into a terminal or chat: only this session key can open it. It is not stored in this browser or sent
      anywhere.
    </p>
  </div>
);

/** The warning and the sign button; nothing where the phase offers no signing. */
const SignArea = ({ action, onSign }: { action: { label: string; enabled: boolean } | null; onSign: () => void }) =>
  action === null ? null : (
    <>
      <Notice tone='warn' title='Before you sign' className='mt-4'>
        <p className='mt-1'>{GROUP_KEY_WARNING}</p>
      </Notice>
      <div className='mt-4'>
        <Button variant='primary' size='compact' disabled={!action.enabled} onClick={onSign}>
          {action.label}
        </Button>
      </div>
    </>
  );

const Detail = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div className='grid gap-1 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-4'>
    <dt className='text-muted-foreground'>{term}</dt>
    <dd className='min-w-0 text-foreground'>{children}</dd>
  </div>
);

interface GroupKeyStepProps {
  number: number;
  network: Network;
  account: Hex;
  /** The session key the link authorizes: the Grant's only possible holder. */
  sessionKey: Hex;
  keyAgreement: KeyAgreementRequest;
  /** The session key's authorization expiry, unix seconds; null until it is authorized. The Grant's claim ends with it. */
  expires: bigint | null;
  onIssued: () => void;
}

/**
 * Give the session key the owner's group key, so the tool can encrypt and
 * decrypt without the wallet. The wallet signs for the group key (twice for a
 * new one, to check it signs deterministically), then signs the claim that
 * lets providers serve the session key until its authorization ends. Nothing
 * is written on chain or stored: the Grant is shown once to paste, and a
 * reload offers the step again.
 */
export const GroupKeyStep = ({
  number,
  network,
  account,
  sessionKey,
  keyAgreement,
  expires,
  onIssued,
}: GroupKeyStepProps) => {
  const chainId = getChain(network).id;
  const { data: wallet } = useWalletClient({ chainId });
  // Checked before anything else: a pubkey the session key did not sign could be anyone's.
  const bound = useQuery({
    queryKey: ["key-agreement-signature", sessionKey, keyAgreement.pubkey, keyAgreement.pubkeysig],
    queryFn: () => verifyKeyAgreementKey(sessionKey, keyAgreement),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const choice = useGroupKeyChoice(network, account, bound.data === true);
  const issue = useMutation({
    mutationFn: ({ wallet, chosen, expires }: { wallet: WalletClient; chosen: ChosenGroupKey; expires: bigint }) =>
      issueGroupKeyGrant(
        {
          // Privy resolves a request while its dialog is still animating closed; the next one
          // must wait for it, or it lands under the old screen and crashes it. See waitForPrivyModalToClose.
          signTypedData: async (args) => {
            await waitForPrivyModalToClose();
            return wallet.signTypedData({ ...args, account });
          },
        },
        {
          owner: account,
          groupKeyId: chosen.groupKeyId,
          commitment: chosen.commitment,
          chainId,
          bearer: sessionKey,
          pubkey: keyAgreement.pubkey,
          expires,
        },
      ),
    onSuccess: () => onIssued(),
  });
  const phase = groupKeyPhase({
    signatureValid: bound.data,
    expires,
    choice: choice.data,
    choiceFailed: choice.isError,
    walletReady: !!wallet,
    issuing: issue.isPending,
    issueError: issue.error,
    grant: issue.data,
  });
  const groupKey = "groupKey" in phase ? phase.groupKey : null;
  const sign = () => {
    if (wallet && groupKey && expires !== null) issue.mutate({ wallet, chosen: groupKey, expires });
  };

  return (
    <SetupStep
      number={number}
      title='Give this key access to encrypted uploads'
      description='Lets the tool encrypt and decrypt your files with the session key, without your wallet. Your wallet signs two or three messages here; none of them is a transaction.'
      status={GROUP_KEY_STATUS[phase.phase]}
    >
      <dl className='divide-y rounded-lg border px-4 text-sm'>
        <Detail term='Session key'>
          <span className='inline-flex max-w-full items-start gap-1.5'>
            <span className='font-mono text-base font-medium break-all'>{sessionKey}</span>
            <CopyButton value={sessionKey} tooltipText='Copy session key address' successMessage='Address copied' />
          </span>
          <span className='mt-0.5 block text-xs text-muted-foreground'>
            Only this key can open the Grant. Check it matches the address your terminal printed.
          </span>
        </Detail>
        <Detail term='Group key'>
          {groupKey ? (
            <>
              <span className='font-mono text-xs break-all'>{groupKey.groupKeyId}</span>
              <span className='mt-0.5 block text-xs text-muted-foreground'>
                {groupKey.commitment
                  ? "Tags your encrypted data sets. The session key gets access to every data set under this key."
                  : "New: none of your data sets uses a group key yet."}
              </span>
            </>
          ) : (
            "Not chosen yet"
          )}
        </Detail>
        <Detail term='Fetching ends'>
          {expires === null
            ? "When the session key's authorization ends."
            : `${formatDateTime(Number(expires) * 1000)}, with the session key's authorization.`}
        </Detail>
      </dl>

      <GroupKeyNotice phase={phase} onRetryRead={() => void choice.refetch()} />
      {phase.phase === "issued" ? (
        <GrantOutput grant={phase.grant} />
      ) : (
        <SignArea action={SIGN_ACTION[phase.phase]} onSign={sign} />
      )}
    </SetupStep>
  );
};
