import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";
import { AlertCircle } from "lucide-react";
import { CustomConnectButton } from "@/components/shared";

const ErrorState = ({ error }: { error: Error | null }) => {
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
                <AlertCircle className='h-16 w-16 text-destructive' />
                <EmptyTitle>Failed to Load Account</EmptyTitle>
                <EmptyDescription>{error?.message || "Something went wrong. Please try again."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    </main>
  );
};

export default ErrorState;
