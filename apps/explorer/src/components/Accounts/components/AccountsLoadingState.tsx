import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { Card } from "@filecoin-pay/ui/components/card";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";

function AccountsLoadingState() {
  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <Skeleton className='h-9 w-32' />
          <Skeleton className='h-5 w-64' />
        </div>
        <Card>
          <div className='p-4'>
            <Skeleton className='h-10 w-full' />
          </div>
        </Card>
        <LoadingStateCard message='Loading accounts...' />
      </div>
    </main>
  );
}

export default AccountsLoadingState;
