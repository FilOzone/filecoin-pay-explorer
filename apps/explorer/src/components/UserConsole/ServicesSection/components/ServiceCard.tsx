import { ArrowRight, Waypoints } from "lucide-react";
import Link from "next/link";
import { CopyableText } from "@/components/shared";
import { getServiceProfile } from "@/constants/service-metadata";
import type { AccountService } from "@/hooks/useAccountServices";

export const ServiceCard = ({ service }: { service: AccountService }) => {
  const { address } = service.operator;
  const { name, description } = getServiceProfile(address);

  return (
    <div className='flex flex-col gap-6 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex min-w-0 flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <h4 className='text-xl font-medium'>{name}</h4>
          {description ? <p className='max-w-2xl text-sm text-muted-foreground'>{description}</p> : null}
        </div>

        <div className='flex flex-wrap items-center gap-4 text-sm text-muted-foreground'>
          <CopyableText
            value={address}
            label='Operator address'
            truncate
            truncateLength={6}
            lookupName={false}
            className='text-sm font-normal'
          />
          <span className='hidden h-4 w-px bg-border sm:block' />
          <span className='flex items-center gap-2'>
            <Waypoints className='size-4' />
            {service.totalActiveRails.toString()} active / {service.totalRails.toString()} total rails
          </span>
        </div>
      </div>

      <Link
        href={`/console/services/${address}`}
        className='flex shrink-0 items-center gap-2.5 self-start rounded-sm text-base font-medium transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400 sm:self-center'
      >
        <ArrowRight className='size-5' />
        Manage
      </Link>
    </div>
  );
};

export default ServiceCard;
