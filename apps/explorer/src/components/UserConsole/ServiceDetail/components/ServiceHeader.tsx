import { CopyableText } from "@/components/shared";
import type { ServiceProfile } from "@/constants/service-metadata";

type ServiceHeaderProps = {
  operatorAddress: string;
  profile: ServiceProfile;
};

export const ServiceHeader = ({ operatorAddress, profile }: ServiceHeaderProps) => (
  <div className='flex flex-col gap-3'>
    <h2 className='text-3xl font-medium'>{profile.name}</h2>

    {profile.description ? <p className='max-w-3xl text-muted-foreground'>{profile.description}</p> : null}

    <div className='flex flex-wrap items-center gap-4 text-sm'>
      {/* Copyable, deliberately not a link for security reasons. */}
      {profile.homepageUrl ? (
        <CopyableText value={profile.homepageUrl} label='Homepage URL' monospace={false} className='text-sm' />
      ) : null}

      {/* The heading already carries the service name, so this stays the address. */}
      <CopyableText
        value={operatorAddress}
        label='Operator address'
        truncate
        truncateLength={6}
        lookupName={false}
        className='text-sm font-normal text-muted-foreground'
      />
    </div>
  </div>
);

export default ServiceHeader;
