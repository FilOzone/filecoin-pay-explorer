import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useMemo } from "react";
import { useAccountServices } from "@/hooks/useAccountServices";
import { useServiceMetadata } from "@/hooks/useServiceMetadata";
import type { Network } from "@/types";
import {
  ServiceCard,
  ServicesEmptyState,
  ServicesErrorState,
  ServicesLoadingState,
  ServicesSectionLayout,
} from "./components";

interface ServicesSectionProps {
  accountId: string;
  network: Network;
}

/**
 * The payer's indexed service relationships. Pages with an `id_gt` cursor
 * rather than a page number: a payer usually has a handful of services, and the
 * cursor stays correct when the underlying list changes between requests.
 */
export const ServicesSection: React.FC<ServicesSectionProps> = ({ accountId, network }) => {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = useAccountServices(accountId, {
    networkOverride: network,
  });

  const services = useMemo(() => data?.pages.flatMap((page) => page.services) ?? [], [data]);

  // One batched contract read for every operator on screen. Memoized because
  // the hook keys its reads off this array's identity.
  const operatorAddresses = useMemo(() => services.map((service) => service.operator.address), [services]);
  const { metadata } = useServiceMetadata(operatorAddresses);

  if (isLoading) {
    return <ServicesLoadingState />;
  }

  if (isError) {
    return <ServicesErrorState />;
  }

  if (services.length === 0) {
    return <ServicesEmptyState />;
  }

  return (
    <ServicesSectionLayout>
      <div className='flex flex-col gap-4'>
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            metadata={metadata.get(service.operator.address.toLowerCase())}
          />
        ))}
      </div>

      {hasNextPage ? (
        <div className='flex justify-center'>
          <Button variant='tertiary' size='compact' onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </ServicesSectionLayout>
  );
};
