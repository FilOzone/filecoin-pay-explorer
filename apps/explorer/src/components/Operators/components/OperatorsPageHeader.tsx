import { Heading } from "@filecoin-foundation/ui-filecoin/Heading";

function OperatorsPageHeader() {
  return (
    <div className='flex flex-col gap-2'>
      <Heading tag='h1' variant='page-heading'>
        Filecoin Pay Operators
      </Heading>
      <p className='text-muted-foreground'>Browse all operators on the network</p>
    </div>
  );
}

export default OperatorsPageHeader;
