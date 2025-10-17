import { Card } from "@filecoin-pay/ui/components/card";
import { AlertTriangle } from "lucide-react";
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

        {/* Beta Warning */}
        <Card className='border-yellow-500/50 bg-yellow-500/10 p-4'>
          <div className='flex gap-3'>
            <AlertTriangle className='h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5' />
            <div className='flex flex-col gap-1'>
              <h3 className='font-semibold text-yellow-900 dark:text-yellow-500'>Beta Version - Use with Caution</h3>
              <p className='text-sm text-muted-foreground'>
                This console is currently in beta and interacts directly with smart contracts on the Filecoin network.
                Please use with caution and always verify transaction details before confirming.
              </p>
            </div>
          </div>
        </Card>

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
