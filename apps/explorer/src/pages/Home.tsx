import RecentRails from "@/components/Home/RecentRails";
import Stats from "@/components/Home/Stats";
import TopAccounts from "@/components/Home/TopAccounts";
import TopOperators from "@/components/Home/TopOperators";

function Home() {
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

export default Home;
