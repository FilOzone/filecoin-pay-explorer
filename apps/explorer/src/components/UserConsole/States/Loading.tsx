import { CustomConnectButton } from "@/components/shared";
import {
  AccountInfoSkeleton,
  FundsSectionSkeleton,
  OperatorApprovalsSectionSkeleton,
  RailsSectionSkeleton,
} from "@/components/UserConsole";

const Loading = () => {
  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        <div className='flex justify-between items-center'>
          <h1 className='text-3xl font-bold'>Filecoin Pay Console</h1>
          <CustomConnectButton />
        </div>
        <AccountInfoSkeleton />
        <FundsSectionSkeleton />
        <RailsSectionSkeleton />
        <OperatorApprovalsSectionSkeleton />
      </div>
    </main>
  );
};

export default Loading;
