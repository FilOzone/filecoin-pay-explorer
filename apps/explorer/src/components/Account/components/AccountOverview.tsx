import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Account, Address } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import { ArrowsSplitIcon, CoinsIcon, UserCheckIcon } from "@phosphor-icons/react";
import CopyableText from "@/components/shared/CopyableText";
import CopyButton from "@/components/shared/CopyButton";
import MetricItem from "@/components/shared/MetricItem";
import OnchainNameMarker from "@/components/shared/OnchainNameMarker";
import { useAddressName } from "@/hooks/useAddressName";
import useNetwork from "@/hooks/useNetwork";
import { formatCompactNumber } from "@/utils/formatter";

interface AccountOverviewLayoutProps {
  children: React.ReactNode;
  address: Address;
}

const AccountOverviewLayout: React.FC<AccountOverviewLayoutProps> = ({ children, address }) => {
  const { network } = useNetwork();
  const { name } = useAddressName(address, network);

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-6 -mt-15'>
        <div className='group flex items-center gap-1'>
          <h3 className='flex min-w-0 items-center gap-1 text-2xl font-medium' title={address}>
            {name?.source === "onchain" ? (
              <>
                {/* Up to 256 chars of contract text; the address tooltip is the identity that counts. */}
                <span className='max-w-xl truncate'>{name.name}</span>
                <OnchainNameMarker />
              </>
            ) : (
              // A curated name, or the address when unnamed or the onchain name was rejected.
              (name?.name ?? address)
            )}
          </h3>
          <CopyButton
            value={address}
            className='opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 transition-opacity ml-1'
            successMessage='Account address copied to clipboard'
          />
        </div>
        {children}
      </div>
    </PageSection>
  );
};

interface AccountOverviewProps {
  account: Account;
}

export const AccountOverview: React.FC<AccountOverviewProps> = ({ account }) => {
  return (
    <AccountOverviewLayout address={account.address}>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <Card className='p-4 md:col-span-2 lg:col-span-4'>
          <div className='flex flex-col gap-1'>
            <span className='text-sm text-muted-foreground'>Account Address</span>
            <CopyableText value={account.address} monospace={true} label='Account address' lookupName={false} />
          </div>
        </Card>

        <MetricItem title='Total Rails' value={formatCompactNumber(account.totalRails)} Icon={ArrowsSplitIcon} />
        <MetricItem title='Total Tokens' value={formatCompactNumber(account.totalTokens)} Icon={CoinsIcon} />
        <MetricItem
          title='Total Approvals'
          value={formatCompactNumber(account.totalApprovals)}
          tooltip='How many payment managers this account has given permission to use their tokens'
          Icon={UserCheckIcon}
        />
      </div>
    </AccountOverviewLayout>
  );
};
