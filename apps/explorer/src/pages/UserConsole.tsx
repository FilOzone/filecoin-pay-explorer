import { useAccount } from "wagmi";
import { CustomConnectButton } from "@/components/shared";
import { AccountInfo, FundsSection, OperatorApprovalsSection, RailsSection } from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { AccountNotFound, ErrorState, Loading, NotConnected } from "@/components/UserConsole/States";
import { useAccountDetails } from "@/hooks/useAccountDetails";

const UserConsoleContent = () => {
  const { address, isConnected } = useAccount();
  const { data: account, isLoading, isError, error } = useAccountDetails(address || "");

  if (!isConnected || !address) return <NotConnected />;

  if (isLoading) return <Loading />;

  if (isError) return <ErrorState error={error} />;

  if (!account) return <AccountNotFound />;

  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        <div className='flex justify-between items-center'>
          <h1 className='text-3xl font-bold'>Filecoin Pay Console</h1>
          <CustomConnectButton />
        </div>
        <AccountInfo account={account} address={address} />
        <FundsSection account={account} />
        <RailsSection account={account} userAddress={address} />
        <OperatorApprovalsSection account={account} />
      </div>
    </main>
  );
};

const UserConsole = () => {
  return (
    <ConsoleProviders>
      <UserConsoleContent />
    </ConsoleProviders>
  );
};

export default UserConsole;
