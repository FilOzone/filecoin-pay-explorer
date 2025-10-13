import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";
import { Wallet } from "lucide-react";
import { CustomConnectButton } from "@/components/shared";

const NotConnected = () => {
  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        <div className='flex justify-between items-center'>
          <h1 className='text-3xl font-bold'>Filecoin Pay Console</h1>
          <CustomConnectButton />
        </div>

        <Card>
          <div className='py-16'>
            <Empty>
              <EmptyHeader>
                <Wallet className='h-16 w-16 text-muted-foreground' />
                <EmptyTitle>Connect Your Wallet</EmptyTitle>
                <EmptyDescription>
                  Please connect your wallet to access the Filecoin Pay Console and manage your funds.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <CustomConnectButton />
              </EmptyContent>
            </Empty>
          </div>
        </Card>
      </div>
    </main>
  );
};

export default NotConnected;
