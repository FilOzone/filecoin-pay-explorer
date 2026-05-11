import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Account, Address } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import { ArrowsSplitIcon, CoinsIcon } from "@phosphor-icons/react";
import { knownAddresses } from "@/constants/known-addresses";
import { formatCompactNumber } from "@/utils/formatter";
import { CopyableText, MetricItem } from "../../shared";

interface AccountOverviewLayoutProps {
  children: React.ReactNode;
  address: Address;
}

const AccountOverviewLayout: React.FC<AccountOverviewLayoutProps> = ({ children, address }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-15'>
      <div className='flex items-center justify-between'>
        <h3 className='text-2xl font-medium'>{knownAddresses[address.toLowerCase()] ?? address}</h3>
      </div>
      {children}
    </div>
  </PageSection>
);

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
        />
      </div>
    </AccountOverviewLayout>
  );
};
