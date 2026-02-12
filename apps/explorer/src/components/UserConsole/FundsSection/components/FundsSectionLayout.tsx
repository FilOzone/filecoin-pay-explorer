import { Button } from "@filecoin-foundation/ui-filecoin/Button";

interface FundsSectionLayoutProps {
  children: React.ReactNode;
  handleOpenDeposit: () => void;
}

const FundsSectionLayout = ({ children, handleOpenDeposit }: FundsSectionLayoutProps) => (
  <div className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <h3 className='text-2xl font-medium'>Funds</h3>
      <Button className='py-2' variant='primary' onClick={handleOpenDeposit}>
        Deposit
      </Button>
    </div>
    {children}
  </div>
);

export default FundsSectionLayout;
