import RecentAccounts from "@/components/Home/RecentAccounts";
import RecentOperators from "@/components/Home/RecentOperators";
import RecentRails from "@/components/Home/RecentRails";
import Stats from "@/components/Home/Stats";

function Home() {
  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-8'>
        <Stats />
        <RecentRails />
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
          <RecentAccounts />
          <RecentOperators />
        </div>
      </div>
    </main>
  );
}

export default Home;
