import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  AccountApprovals,
  AccountErrorState,
  AccountLoadingState,
  AccountNotFoundState,
  AccountOverview,
  AccountRails,
  AccountTokens,
} from "@/components/Account";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { formatAddress } from "@/utils/formatter";

const AccountDetail = () => {
  const { address } = useParams<{ address: string }>();
  const { data: account, isLoading, isError, error, refetch } = useAccountDetails(address || "");

  if (isLoading) {
    return <AccountLoadingState />;
  }

  if (isError) {
    return <AccountErrorState refetch={refetch} error={error} />;
  }

  if (!account) {
    return <AccountNotFoundState address={address || ""} />;
  }

  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        {/* Back button and header */}
        <div className='flex flex-col gap-4'>
          <Link to='/accounts' className='flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit'>
            <ArrowLeft className='h-4 w-4' />
            <span className='text-sm'>Back to Accounts</span>
          </Link>
          <h1 className='text-3xl font-bold'>Account {formatAddress(account.address)}</h1>
        </div>

        {/* Account Overview */}
        <AccountOverview account={account} />

        {/* Deposited Tokens */}
        <AccountTokens account={account} />

        {/* Rails (with payer/payee highlighting) */}
        <AccountRails account={account} />

        {/* Operator Approvals */}
        <AccountApprovals account={account} />
      </div>
    </main>
  );
};

export default AccountDetail;
