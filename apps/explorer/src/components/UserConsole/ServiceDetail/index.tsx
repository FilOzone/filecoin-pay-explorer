import { getChain } from "@/constants/chains";
import { useAccountService } from "@/hooks/useAccountServices";
import { useServiceProfiles } from "@/hooks/useServiceProfiles";
import type { Network } from "@/types";
import { DatasetsSection } from "../DatasetsSection";
import { RailsSection } from "../RailsSection";
import { StaleQueue } from "../StaleQueue";
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

  const profileFor = useServiceProfiles([operatorId], network);

  if (isLoading) {
    return <ServiceLoadingState />;
  }

  if (isError) {
    return <ServiceErrorState />;
  }

  if (!service) {
    return <ServiceNotFoundState />;
  }

  const profile = profileFor(operatorId);
  // Only one deployment of Warm Storage exists per network, so its FWSS contract
  // address is what "the operator is Warm Storage" means for this route.
  const isWarmStorage = operatorId === getChain(network).contracts.fwss.address.toLowerCase();

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

      {isWarmStorage ? (
        <>
          <DatasetsSection key={`${network}:${accountId}:datasets`} accountId={accountId} network={network} />
          <StaleQueue key={`${network}:${accountId}:stale`} accountId={accountId} network={network} />
        </>
      ) : null}
    </div>
  );
};
