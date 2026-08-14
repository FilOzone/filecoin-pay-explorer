import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ChevronDown, CircleArrowDown, CircleArrowUp } from "lucide-react";

interface FundsSectionLayoutProps {
  children: React.ReactNode;
  handleOpenDeposit: () => void;
  handleOpenWithdraw?: () => void;
  tokenSymbol?: string;
}

const FundsSectionLayout = ({
  children,
  handleOpenDeposit,
  handleOpenWithdraw,
  tokenSymbol,
}: FundsSectionLayoutProps) => (
  <div className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <div className='flex items-end gap-4'>
        <h3 className='text-2xl font-medium'>Funds overview</h3>
        {tokenSymbol && (
          <button
            type='button'
            className='flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition-colors hover:border hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700'
          >
            {tokenSymbol}
            <ChevronDown className='size-3.5' />
          </button>
        )}
      </div>
      <div className='flex items-center gap-2'>
        <Button className='py-2' variant='primary' icon={CircleArrowDown} onClick={handleOpenDeposit}>
          Deposit
        </Button>
        {handleOpenWithdraw && (
          <Button className='py-2' variant='ghost' icon={CircleArrowUp} onClick={handleOpenWithdraw}>
            Withdraw
          </Button>
        )}
      </div>
    </div>
    {children}
  </div>
);

export default FundsSectionLayout;
