"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { Account } from "@filecoin-pay/types";
import { useEffect, useMemo, useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { Notice } from "@/components/shared/Notice";
import { AlertsBanner, FundsSection, OperatorApprovalsSection, ServicesSection } from "@/components/UserConsole";
import AddServiceDialog, { type AddServicePrefill } from "@/components/UserConsole/AddServiceDialog";
import { useTopUpActivity } from "@/components/UserConsole/providers/TopUpActivityContext";
import { AccountNotFound, ErrorState, UnsupportedChain } from "@/components/UserConsole/States";
import { useConsoleNetwork } from "@/components/UserConsole/useConsoleNetwork";
import { getChain } from "@/constants/chains";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useConsumedSearchParams } from "@/hooks/useConsumedSearchParams";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import type { Network } from "@/types";
import { type DepositLink, parseDepositLink, resolveOperator } from "@/utils/depositParam";
import { isNotificationsEligibleNetwork } from "@/utils/network";

/**
 * Turns the link's values into dialog fields; the link names the network the
 * wallet is on. The dialog itself grants unlimited allowances and the 30-day
 * lockup period by default, the same terms filecoin-pin leaves to the SDK.
 */
function toDialogPrefill(link: DepositLink): AddServicePrefill {
  return {
    token: getChain(link.network).contracts.usdfc.address,
    // An approval-only link leaves the deposit empty; the dialog adds the service without one.
    amount: link.amount ?? "",
    operator: resolveOperator(link.operator, link.network),
  };
}

/** Shown when the link carried deposit fields the page could not parse. */
const UnreadableFundingLinkNotice = () => (
  <Notice tone='warn' role='alert' title='This funding link could not be read' className='p-4'>
    <p className='text-xs mt-1'>Nothing was filled in. Ask for a new link.</p>
  </Notice>
);

/** Shown instead of the dialog when an approval-only link asks for an approval the account already has. */
const AlreadyApprovedFundingLinkNotice = () => (
  <Notice tone='info' role='status' title='Warm Storage is already approved' className='p-4'>
    <p className='text-xs mt-1'>
      This account already approved it, so there is nothing to add and its spending limits were left as they are.
    </p>
  </Notice>
);

/** Shown when the link names a network other than the one the wallet is on. */
const OtherNetworkFundingLinkNotice = ({
  linkNetwork,
  consoleNetwork,
}: {
  linkNetwork: Network;
  consoleNetwork: Network;
}) => (
  <Notice tone='warn' role='alert' className='p-4'>
    <p className='font-semibold'>
      This funding link is for <span className='capitalize'>{linkNetwork}</span>, but your wallet is connected to{" "}
      <span className='capitalize'>{consoleNetwork}</span>.
    </p>
    <p className='text-xs mt-1'>
      Nothing was filled in. Switch your wallet to <span className='capitalize'>{linkNetwork}</span> and open the link
      again.
    </p>
  </Notice>
);

type AccountSectionsProps = {
  account: Account | null | undefined;
  // React Query guarantees error is non-null exactly when the query has failed,
  // so it doubles as the error flag.
  error: Error | null;
  isLoading: boolean;
  network: Network;
  /**
   * Rendered below the funds overview rather than above the page: the prompt to
   * enable alerts lands better once the reader has seen the balances it protects.
   * Passed in as a node so the states that render no funds overview can still
   * place it, keeping the banner visible exactly when it was before.
   */
  alertsBanner: React.ReactNode;
};

const AccountSections = ({ account, error, isLoading, network, alertsBanner }: AccountSectionsProps) => {
  if (isLoading) {
    return (
      <>
        <LoadingStateCard message='Loading your account details...' />
        {alertsBanner}
      </>
    );
  }

  if (!account) {
    return (
      <>
        {error ? <ErrorState error={error} /> : <AccountNotFound network={network} />}
        {alertsBanner}
      </>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-6'>
        <FundsSection account={account} network={network} />
        {alertsBanner}
      </div>
      <ServicesSection accountId={account.id} network={network} />
      <OperatorApprovalsSection account={account} network={network} />

      {/* A failed background refetch still leaves the last good account on screen. */}
      {error ? <ErrorState error={error} /> : null}
    </>
  );
};

const UserConsole = () => {
  const { address, chainId } = useConnection();
  const { isTopUpActive } = useTopUpActivity();
  const { network, isFilecoinChain, isSquidSourceChain } = useConsoleNetwork();
  const canLoadFilecoinConsole = chainId === undefined || isFilecoinChain || (isTopUpActive && isSquidSourceChain);

  const { data: notificationStatus, isError: isNotificationStatusError } = useNotificationStatus(
    canLoadFilecoinConsole ? address : undefined,
  );
  const isSubscribed = notificationStatus?.subscribed === true;
  const showAlertsBanner = isNotificationsEligibleNetwork(network) && !isSubscribed && !isNotificationStatusError;

  const accountQuery = useAccountDetails(canLoadFilecoinConsole ? (address ?? "") : "", {
    networkOverride: network,
  });

  const accountSections = () =>
    address ? (
      <AccountSections
        account={accountQuery.data}
        error={accountQuery.error}
        isLoading={accountQuery.isLoading}
        network={network}
        alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
      />
    ) : null;

  const fundingLink = useConsumedSearchParams(["deposit", "operator", "network"]);
  const depositLink = useMemo(() => (fundingLink ? parseDepositLink(fundingLink) : null), [fundingLink]);
  const [dialogDismissed, setDialogDismissed] = useState(false);
  // A funding link ends in exactly one of four states: unreadable, for another
  // network, already done (an approval the account has), or opening the dialog on this one.
  const asksToFund = fundingLink !== null && (fundingLink.has("deposit") || fundingLink.has("operator"));
  const hasUnreadableFundingLink = asksToFund && depositLink === null;
  // A link for another network prefills nothing: approving it here would fund the wrong chain's operator.
  const isFundingLinkForOtherNetwork = depositLink !== null && isFilecoinChain && depositLink.network !== network;
  const isFundingLinkForWallet = depositLink !== null && isFilecoinChain && depositLink.network === network;
  // An approval-only link has nothing to do once the operator is approved; opening the dialog
  // anyway would re-approve with its unlimited defaults over the owner's own limits.
  const isApprovalOnlyLink = isFundingLinkForWallet && depositLink.amount === null;
  // Decided once per wallet and network, from the first answer: approving through the dialog
  // refetches this read, and the owner must not then be told there was nothing to add.
  const approvalKey = isApprovalOnlyLink && address ? `${network}:${address}` : null;
  const [settledApproval, setSettledApproval] = useState<{ key: string; approved: boolean } | null>(null);
  const approvalAtArrival = settledApproval?.key === approvalKey ? settledApproval : null;
  const chain = getChain(network);
  const { data: existingApproval, isPending: isCheckingApproval } = useReadContract({
    address: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    chainId: chain.id,
    functionName: "operatorApprovals",
    args:
      isApprovalOnlyLink && address
        ? [chain.contracts.usdfc.address, address, resolveOperator(depositLink.operator, network)]
        : undefined,
    // A failed read opens the dialog anyway, so retrying would only keep the owner waiting.
    query: { enabled: approvalKey !== null && approvalAtArrival === null, retry: false },
  });
  useEffect(() => {
    if (approvalKey === null || approvalAtArrival !== null || isCheckingApproval) return;
    // A failed read counts as not approved: the owner reviews the approval in the dialog.
    setSettledApproval({ key: approvalKey, approved: existingApproval?.[0] === true });
  }, [approvalKey, approvalAtArrival, isCheckingApproval, existingApproval]);
  const isAlreadyApproved = isApprovalOnlyLink && approvalAtArrival?.approved === true;
  const shouldOpenFundingDialog =
    isFundingLinkForWallet && !dialogDismissed && (!isApprovalOnlyLink || approvalAtArrival?.approved === false);
  // Stable across renders: the dialog applies its prefill whenever the object changes.
  const depositPrefill = useMemo(
    () => (shouldOpenFundingDialog && depositLink ? toDialogPrefill(depositLink) : null),
    [shouldOpenFundingDialog, depositLink],
  );

  return (
    <div className='flex flex-col gap-15'>
      {hasUnreadableFundingLink && <UnreadableFundingLinkNotice />}
      {isAlreadyApproved && <AlreadyApprovedFundingLinkNotice />}
      {isFundingLinkForOtherNetwork && (
        <OtherNetworkFundingLinkNotice linkNetwork={depositLink.network} consoleNetwork={network} />
      )}
      {depositPrefill && (
        <AddServiceDialog
          // A chain switch remounts the dialog so token and operator follow the console network.
          key={network}
          network={network}
          open
          onOpenChange={(open) => {
            if (!open) setDialogDismissed(true);
          }}
          prefill={depositPrefill}
        />
      )}
      {isSquidSourceChain && !isTopUpActive ? <UnsupportedChain /> : canLoadFilecoinConsole ? accountSections() : null}
    </div>
  );
};

export default UserConsole;
