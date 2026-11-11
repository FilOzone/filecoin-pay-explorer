import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useMemo, useState } from "react";
import AddServiceDialog from "@/components/UserConsole/AddServiceDialog";
import { useAccountServices } from "@/hooks/useAccountServices";
import { useServiceProfiles } from "@/hooks/useServiceProfiles";
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

  const [addServiceOpen, setAddServiceOpen] = useState(false);

  const services = useMemo(() => data?.pages.flatMap((page) => page.services) ?? [], [data]);

  const profileFor = useServiceProfiles(
    services.map((service) => service.operator.address),
    network,
  );

  let content: React.ReactNode;
  if (isLoading) {
    content = <ServicesLoadingState />;
  } else if (isError) {
    content = <ServicesErrorState />;
  } else if (services.length === 0) {
    content = <ServicesEmptyState />;
  } else {
    content = (
      <>
        <div className='flex flex-col gap-4'>
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} profile={profileFor(service.operator.address)} />
          ))}
        </div>

        {hasNextPage ? (
          <div className='flex justify-center'>
            <Button variant='tertiary' size='compact' onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  // The dialog sits outside the states so Add Service works while the list is loading or failing to load.
  return (
    <>
      <ServicesSectionLayout onAddService={() => setAddServiceOpen(true)}>{content}</ServicesSectionLayout>
      <AddServiceDialog network={network} open={addServiceOpen} onOpenChange={setAddServiceOpen} />
    </>
  );
};
