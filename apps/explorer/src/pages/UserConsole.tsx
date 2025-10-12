import { CustomConnectButton } from "@/components/shared";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";

const UserConsole = () => {
  return (
    <ConsoleProviders>
      <main className='flex-1 px-3 sm:px-6 py-6'>
        <div className='flex justify-between gap-4'>
          <div>Filecoin Pay Console</div>
          <CustomConnectButton />
        </div>
      </main>
    </ConsoleProviders>
  );
};

export default UserConsole;
