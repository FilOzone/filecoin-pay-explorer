import { RecentRails, Stats, TopAccounts, TopOperators } from "@/components/Home";

function Page() {
  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-8'>
        <Stats />
        <RecentRails />
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
          <TopAccounts />
          <TopOperators />
        </div>
      </div>
    </main>
  );
}

export default Page;
