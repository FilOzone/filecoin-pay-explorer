"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { Account } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";
import {
  AlertsBanner,
  FundsSection,
  OperatorApprovalsSection,
  RailsSection,
  TopUpDialogController,
} from "@/components/UserConsole";
import DepositAndApproveDialog, {
  type DepositAndApprovePrefill,
} from "@/components/UserConsole/DepositAndApproveDialog";
import { AccountNotFound, ErrorState, UnsupportedChain } from "@/components/UserConsole/States";
import { useTopUpActivity } from "@/components/UserConsole/TopUpActivityContext";
import { getChain, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { useConsumedSearchParams } from "@/hooks/useConsumedSearchParams";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import type { Network } from "@/types";
import { type DepositLink, parseDepositLink, resolveOperator } from "@/utils/depositParam";
import { getNetworkFromChainId, isNotificationsEligibleNetwork, isSupportedChainId } from "@/utils/network";

// The lockup period filecoin-pin also leaves to the SDK default: 30 days of epochs.
const DEFAULT_MAX_LOCKUP_PERIOD = String(TIME_CONSTANTS.DEFAULT_LOCKUP_DAYS * TIME_CONSTANTS.EPOCHS_PER_DAY);

/** Turns the link's values into dialog fields; the link names the network the wallet is on. */
function toDialogPrefill(link: DepositLink): DepositAndApprovePrefill {
  return {
    token: getChain(link.network).contracts.usdfc.address,
    amount: link.amount,
    operator: resolveOperator(link.operator, link.network),
    unlimitedAllowances: true,
    maxLockupPeriod: DEFAULT_MAX_LOCKUP_PERIOD,
  };
}

type AccountSectionsProps = {
  account: Account | null | undefined;
  // React Query guarantees error is non-null exactly when the query has failed,
  // so it doubles as the error flag.
  error: Error | null;
  isLoading: boolean;
  network: Network;
  onGuidedTopUp?: () => void;
  userAddress: string;
  /**
   * Rendered below the funds overview rather than above the page: the prompt to
   * enable alerts lands better once the reader has seen the balances it protects.
   * Passed in as a node so the states that render no funds overview can still
   * place it, keeping the banner visible exactly when it was before.
   */
  alertsBanner: React.ReactNode;
};

const AccountSections = ({
  account,
  error,
  isLoading,
  network,
  onGuidedTopUp,
  userAddress,
  alertsBanner,
}: AccountSectionsProps) => {
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
        {error ? <ErrorState error={error} /> : <AccountNotFound />}
        {alertsBanner}
      </>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-6'>
        <FundsSection account={account} network={network} onGuidedTopUp={onGuidedTopUp} />
        {alertsBanner}
      </div>
      <RailsSection account={account} network={network} userAddress={userAddress} />
      <OperatorApprovalsSection account={account} network={network} />

      {/* A failed background refetch still leaves the last good account on screen. */}
      {error ? <ErrorState error={error} /> : null}
    </>
  );
};

const UserConsole = () => {
  const { address, chainId } = useConnection();
  const { isTopUpActive } = useTopUpActivity();
  const walletNetwork = getNetworkFromChainId(chainId);
  const isFilecoinChain = isSupportedChainId(chainId);
  const isSquidSourceChain = !isFilecoinChain && SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId);
  const isFilecoinMainnet = (chainId === undefined || isFilecoinChain) && walletNetwork === "mainnet";
  const displayMainnetDuringTopUp = isTopUpActive && isSquidSourceChain;
  const displayNetwork = displayMainnetDuringTopUp ? "mainnet" : walletNetwork;
  const canLoadFilecoinConsole = chainId === undefined || isFilecoinChain || displayMainnetDuringTopUp;
  const canMountTopUpController = isFilecoinMainnet || isSquidSourceChain;

  const { data: notificationStatus, isError: isNotificationStatusError } = useNotificationStatus(
    canLoadFilecoinConsole ? address : undefined,
  );
  const isSubscribed = notificationStatus?.subscribed === true;
  const showAlertsBanner =
    isNotificationsEligibleNetwork(displayNetwork) && !isSubscribed && !isNotificationStatusError;

  const accountQuery = useAccountDetails(canLoadFilecoinConsole ? (address ?? "") : "", {
    networkOverride: displayNetwork,
  });

  const accountSections = (onGuidedTopUp?: () => void) =>
    address ? (
      <AccountSections
        account={accountQuery.data}
        error={accountQuery.error}
        isLoading={accountQuery.isLoading}
        network={displayNetwork}
        onGuidedTopUp={onGuidedTopUp}
        userAddress={address}
        alertsBanner={showAlertsBanner ? <AlertsBanner /> : null}
      />
    ) : null;

  const showTopUpTrigger = !accountQuery.isLoading && !accountQuery.error && !accountQuery.data;

  const fundingLink = useConsumedSearchParams(["deposit", "operator", "network"]);
  const depositLink = useMemo(() => (fundingLink ? parseDepositLink(fundingLink) : null), [fundingLink]);
  const [dialogDismissed, setDialogDismissed] = useState(false);
  // A link for another network prefills nothing: approving it here would fund the wrong chain's operator.
  const isLinkNetworkMismatch = depositLink !== null && isFilecoinChain && depositLink.network !== walletNetwork;
  // Stable across renders: the dialog applies its prefill whenever the object changes.
  const depositPrefill = useMemo(
    () =>
      depositLink && !dialogDismissed && isFilecoinChain && depositLink.network === walletNetwork
        ? toDialogPrefill(depositLink)
        : null,
    [depositLink, dialogDismissed, isFilecoinChain, walletNetwork],
  );

  return (
    <div className='flex flex-col gap-15'>
      {fundingLink && !depositLink && (fundingLink.has("deposit") || fundingLink.has("operator")) && (
        <div
          role='alert'
          className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200'
        >
          <p className='font-semibold'>This funding link could not be read</p>
          <p className='text-xs mt-1'>Nothing was filled in. Ask for a new link.</p>
        </div>
      )}
      {isLinkNetworkMismatch && (
        <div
          role='alert'
          className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200'
        >
          <p className='font-semibold'>
            This funding link is for <span className='capitalize'>{depositLink?.network}</span>, but your wallet is
            connected to <span className='capitalize'>{walletNetwork}</span>.
          </p>
          <p className='text-xs mt-1'>
            Nothing was filled in. Switch your wallet to <span className='capitalize'>{depositLink?.network}</span> and
            open the link again.
          </p>
        </div>
      )}
      {depositPrefill && (
        <DepositAndApproveDialog
          // A chain switch remounts the dialog so token and operator follow the wallet's network.
          key={walletNetwork}
          open
          onOpenChange={(open) => {
            if (!open) setDialogDismissed(true);
          }}
          prefill={depositPrefill}
        />
      )}
      {/* The (console) layout gates on a connected wallet, so address is set here. */}
      {address && canMountTopUpController ? (
        <TopUpDialogController
          accountId={accountQuery.data?.id ?? address}
          key={address}
          showTrigger={isFilecoinMainnet && showTopUpTrigger}
        >
          {(openTopUp, isOpen) => (isSquidSourceChain && !isOpen ? <UnsupportedChain /> : accountSections(openTopUp))}
        </TopUpDialogController>
      ) : canLoadFilecoinConsole ? (
        accountSections()
      ) : null}
    </div>
  );
};

export default UserConsole;
