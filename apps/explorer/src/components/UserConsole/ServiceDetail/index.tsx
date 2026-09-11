import { useMemo } from "react";
import { getChain } from "@/constants/chains";
import { getServiceProfile } from "@/constants/service-metadata";
import { useAccountService } from "@/hooks/useAccountServices";
import { useServiceMetadata } from "@/hooks/useServiceMetadata";
import type { Network } from "@/types";
import { RailsSection } from "../RailsSection";
import {
  ServiceErrorState,
  ServiceHeader,
  ServiceLoadingState,
  ServiceNotFoundState,
  ServicePricing,
} from "./components";

interface ServiceDetailProps {
  network: Network;
  operatorAddress: string;
  /** The connected wallet, which the console always treats as the payer. */
  userAddress: string;
}

/**
 * One payer/operator service relationship. The relationship itself is the
 * authorization check: `AccountOperator` is keyed by payer and operator, so an
 * operator the connected account has never transacted with resolves to null and
 * renders as not found.
 */
export const ServiceDetail: React.FC<ServiceDetailProps> = ({ network, operatorAddress, userAddress }) => {
  // Indexed ids are lowercase hex. Normalizing here keeps a checksummed URL and a lowercase one on the same React Query cache entries.
  const accountId = userAddress.toLowerCase();
  const operatorId = operatorAddress.toLowerCase();

  const {
    data: service,
    isLoading,
    isError,
  } = useAccountService(accountId, operatorId, {
    networkOverride: network,
  });

  const operatorAddresses = useMemo(() => [operatorId], [operatorId]);
  const { metadata } = useServiceMetadata(operatorAddresses, getChain(network).id);

  if (isLoading) {
    return <ServiceLoadingState />;
  }

  if (isError) {
    return <ServiceErrorState />;
  }

  if (!service) {
    return <ServiceNotFoundState />;
  }

  const profile = getServiceProfile(operatorId, metadata.get(operatorId));

  return (
    <div className='flex flex-col gap-10'>
      <ServiceHeader operatorAddress={operatorId} profile={profile} />

      {profile.pricing ? <ServicePricing pricing={profile.pricing} /> : null}

      <RailsSection
        key={`${network}:${accountId}:${operatorId}`}
        accountId={accountId}
        network={network}
        operatorAddress={operatorId}
        totalRails={BigInt(service.totalRails)}
        userAddress={userAddress}
      />
    </div>
  );
};
