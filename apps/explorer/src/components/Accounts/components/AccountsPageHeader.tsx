import { Heading } from "@filecoin-foundation/ui-filecoin/Heading";

function AccountsPageHeader() {
  return (
    <div className='flex flex-col gap-2'>
      <Heading tag='h1' variant='page-heading'>
        Filecoin Pay Accounts
      </Heading>
      <p className='text-muted-foreground'>Browse all accounts on the network</p>
    </div>
  );
}

export default AccountsPageHeader;
