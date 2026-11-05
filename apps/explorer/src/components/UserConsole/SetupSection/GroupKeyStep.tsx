"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ExternalTextLink } from "@filecoin-foundation/ui-filecoin/TextLink/ExternalTextLink";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { KEYSPACE_ID_KEY } from "@filoz/keysmith";
import { paginate } from "@filoz/synapse-core";
import { dataSetLiveCall } from "@filoz/synapse-core/pdp-verifier";
import {
  getAllDataSetMetadataCall,
  getClientDataSetIds,
  parseAllDataSetMetadata,
} from "@filoz/synapse-core/warm-storage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleHelp } from "lucide-react";
import type { Hex, WalletClient } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { type ChosenGroupKey, chooseGroupKey, type GroupKeyDataSet, issueGroupKeyGrant } from "@/utils/groupKeyGrant";
import { waitForPrivyModalToClose } from "@/utils/privy-modal";
import { type KeyAgreementRequest, verifyKeyAgreementKey } from "@/utils/setupLink";
import { type GroupKeyPhase, groupKeyPhase } from "./data/setupStatus";
import { Detail, SetupStep, type StepTone } from "./SetupStep";

export const GROUP_KEY_WARNING =
  "Only continue if you trust this tool with every data set created and every piece uploaded under this group key. Revoking the session key or letting it expire only ends its scopes — it does not take back the encryption key: anyone who obtained it keeps decrypting everything under this group key, existing and future uploads, and can share the contents or the key with others.";

/**
 * Which group key the owner's live data sets settle on, by the rule shared with
 * filecoin-pin. Reads the liveness and metadata of every data set the owner pays
 * for, a page at a time (never its provider), and keeps the live ones that record
 * a group key. Read once per page load, since the
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
      // Only what the choice reads: a page of ids, then each one's liveness and metadata in one multicall.
      const readPage = async ({ cursor }: { cursor: bigint }) => {
        const { items: ids, nextCursor } = await getClientDataSetIds(client, { address: owner, cursor });
        if (ids.length === 0) return { items: [], nextCursor };
        const results = await client.multicall({
          allowFailure: false,
          contracts: ids.flatMap((dataSetId) => [
            dataSetLiveCall({ chain: client.chain, dataSetId }),
            getAllDataSetMetadataCall({ chain: client.chain, dataSetId }),
          ]),
        });
        // The results alternate by data set: dataSetLive, then getAllDataSetMetadata.
        const items = ids.map((dataSetId, i) => ({
          dataSetId,
          live: results[2 * i] === true,
          metadata: parseAllDataSetMetadata(results[2 * i + 1] as Parameters<typeof parseAllDataSetMetadata>[0]),
        }));
        return { items, nextCursor };
      };
      const tagged: GroupKeyDataSet[] = [];
      for await (const dataSet of paginate(readPage)) {
        if (dataSet.live && typeof dataSet.metadata[KEYSPACE_ID_KEY] === "string") {
          tagged.push({ dataSetId: dataSet.dataSetId, metadata: dataSet.metadata });
        }
      }
      return chooseGroupKey(owner, tagged);
    },
  });
}

const SIGN = "Sign to share the group key";

/**
 * Each phase's status, and its sign button: hidden where the step offers no
 * signing at all, else shown with `button` (default {@link SIGN}) as its label.
 */
const GROUP_KEY_STATUS: Record<
  GroupKeyPhase["phase"],
  { tone: StepTone; label: string; sign: "hidden" | "disabled" | "enabled"; button?: string }
> = {
  issued: { tone: "done", label: "Encryption Grant created — copy it to your terminal", sign: "hidden" },
  "unsigned-pubkey": { tone: "problem", label: "Key not signed by the session key", sign: "hidden" },
  "waiting-for-key": { tone: "todo", label: "Authorize the session key first", sign: "disabled" },
  "read-failed": { tone: "problem", label: "Could not read your data sets", sign: "disabled" },
  "inconsistent-default": { tone: "problem", label: "Could not choose a group key", sign: "disabled" },
  choosing: { tone: "waiting", label: "Finding the group key…", sign: "disabled" },
  // useWalletClient resolves after a connect or chain switch; until then nothing can sign.
  "connecting-wallet": {
    tone: "waiting",
    label: "Connecting wallet…",
    sign: "disabled",
    button: "Connecting wallet…",
  },
  signing: {
    tone: "waiting",
    label: "Waiting for wallet signatures…",
    sign: "disabled",
    button: "Waiting for wallet signatures…",
  },
  "sign-failed": {
    tone: "problem",
    label: "Encryption Grant was not created",
    sign: "enabled",
    button: "Try signing again",
  },
  ready: { tone: "todo", label: "Ready to share", sign: "enabled" },
};

/** The one notice a phase shows, if any. */
const GroupKeyNotice = ({ phase, onRetryRead }: { phase: GroupKeyPhase; onRetryRead: () => void }) => {
  switch (phase.phase) {
    case "unsigned-pubkey":
      return (
        <Notice tone='error' role='alert' title='Encryption recipient could not be verified' className='mt-4'>
          <p className='mt-1 text-xs'>
            This encryption public key was not signed by the session key above. No Grant was created. Run the command
            again for a new setup link.
          </p>
        </Notice>
      );
    case "waiting-for-key":
      return (
        <p className='mt-4 text-sm text-muted-foreground'>
          Authorize the session key in the previous step first. Its expiry sets the date the CLI will accept this Grant.
        </p>
      );
    case "read-failed":
      return (
        <Notice tone='error' role='alert' title='Could not check your encryption group' className='mt-4'>
          <p>Your data sets could not be read. Retry before sharing an encryption key.</p>
          <Button variant='ghost' size='compact' className='mt-2' onClick={onRetryRead}>
            Retry
          </Button>
        </Notice>
      );
    case "inconsistent-default":
      return (
        <Notice tone='error' role='alert' title='Encryption group records disagree' className='mt-4'>
          <p className='mt-1 text-xs'>
            Data sets {phase.dataSetIds.join(", ")} record conflicting encryption details for group {phase.groupKeyId}.
            No Grant was created. Resolve these records before continuing.
          </p>
        </Notice>
      );
    case "sign-failed":
      return (
        <Notice tone='error' role='alert' title='Encryption Grant was not created' className='mt-4'>
          <p className='mt-1 text-xs break-words'>The signing process did not complete. {phase.message}</p>
        </Notice>
      );
    case "issued":
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
      Encryption Grant for this session key
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
  </div>
);

/** The chosen group key: a new one, or the one the owner's data sets record. */
const GroupKeyDetail = ({ groupKey }: { groupKey: ChosenGroupKey | null }) => {
  if (!groupKey) return "Not chosen yet";
  return (
    <>
      <span className='font-mono text-xs break-all'>{groupKey.groupKeyId}</span>
      <span className='mt-0.5 block text-xs text-muted-foreground'>
        Public identifier, not the secret key. Access covers everything encrypted with this group key — existing and
        future uploads.
      </span>
    </>
  );
};

/** The warning and the sign button; nothing where the phase offers no signing. */
const SignArea = ({ phase, onSign }: { phase: GroupKeyPhase["phase"]; onSign: () => void }) => {
  const { sign, button = SIGN } = GROUP_KEY_STATUS[phase];
  if (sign === "hidden") return null;
  return (
    <>
      <Notice tone='warn' title='Encryption access cannot be revoked' className='mt-4'>
        <p className='mt-1'>
          <span>{GROUP_KEY_WARNING}</span> Read more about{" "}
          <ExternalTextLink href='https://docs.filecoin.cloud/developer-guides/encryption/share-encrypted-data/#limits'>
            lifecycle and limits
          </ExternalTextLink>
          .
        </p>
      </Notice>
      <p className='mt-4 text-sm'>
        Your wallet signs 2 messages (3 for a new group key). No transaction or network fee.
      </p>
      <details className='mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm'>
        <summary className='cursor-pointer font-medium'>What will my wallet sign?</summary>
        <ol className='mt-2 list-decimal space-y-1 pl-5 text-zinc-600 dark:text-zinc-400'>
          <li>A signature that derives the group key.</li>
          <li>For a new group key, the same signature again, to check it is reproducible.</li>
          <li>A signature that authorizes the group key's encrypted delivery to this session key.</li>
        </ol>
        <p className='mt-2 text-zinc-600 dark:text-zinc-400'>
          Encryption is optional and per-upload; it never changes files already uploaded. Read more in the{" "}
          <ExternalTextLink href='https://docs.filecoin.cloud/developer-guides/encryption/keysmith-encryption-keys/'>
            encryption guide
          </ExternalTextLink>
          .
        </p>
      </details>
      <div className='mt-4'>
        <Button variant='primary' size='compact' disabled={sign === "disabled"} onClick={onSign}>
          {button}
        </Button>
      </div>
    </>
  );
};

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
 * sets the date the CLI accepts the Grant until. Nothing
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
          node: keyAgreement.node,
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
  const groupKey = choice.data && !("error" in choice.data) ? choice.data : null;
  const sign = () => {
    if (wallet && groupKey && expires !== null) issue.mutate({ wallet, chosen: groupKey, expires });
  };

  return (
    <SetupStep
      number={number}
      title='Give this tool an encryption key'
      description={
        <p>
          This shares a group key: a secret that can decrypt every upload encrypted under the group ID below — existing
          and future uploads, across every data set that uses this group key. Access is granted per group, not per file
          or per data set.
        </p>
      }
      status={{ tone: GROUP_KEY_STATUS[phase.phase].tone, label: GROUP_KEY_STATUS[phase.phase].label }}
    >
      <dl className='divide-y rounded-lg border px-4 text-sm'>
        <Detail term='Recipient session key'>
          <span className='inline-flex max-w-full items-start gap-1.5'>
            <span className='font-mono text-base font-medium break-all'>{sessionKey}</span>
            <CopyButton value={sessionKey} tooltipText='Copy session key address' successMessage='Address copied' />
          </span>
          <span className='mt-0.5 block text-xs text-muted-foreground'>
            Only this session key can open the encryption Grant
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  aria-label='What is a Grant?'
                  className='ml-1 inline-flex align-text-top text-muted-foreground hover:text-foreground'
                >
                  <CircleHelp className='size-3.5' />
                </button>
              </TooltipTrigger>
              <TooltipContent className='max-w-xs'>
                A Grant is a signed permission that lets exactly this session key use your group key, without handing
                the key itself to anyone else. Your wallet key never leaves your wallet.
              </TooltipContent>
            </Tooltip>
            . Check the address against your terminal.
          </span>
        </Detail>
        <Detail
          term={
            <span className='inline-flex items-center gap-1'>
              Group key ID
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type='button'
                    aria-label='What is a group key?'
                    className='inline-flex align-text-top text-muted-foreground hover:text-foreground'
                  >
                    <CircleHelp className='size-3.5' />
                  </button>
                </TooltipTrigger>
                <TooltipContent className='max-w-xs'>
                  A group key is the root encryption key for your uploads — one symmetric secret, not a keypair. Your
                  wallet derives it from a signature, so it is never stored anywhere: signing again re-creates the exact
                  same key. Every upload gets its own key derived beneath it.
                </TooltipContent>
              </Tooltip>
            </span>
          }
        >
          <GroupKeyDetail groupKey={groupKey} />
        </Detail>
      </dl>

      <GroupKeyNotice phase={phase} onRetryRead={() => void choice.refetch()} />
      {phase.phase === "issued" ? <GrantOutput grant={phase.grant} /> : <SignArea phase={phase.phase} onSign={sign} />}
    </SetupStep>
  );
};
