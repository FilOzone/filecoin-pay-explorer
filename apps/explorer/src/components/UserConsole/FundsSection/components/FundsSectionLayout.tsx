import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ArrowCircleDownIcon, ArrowCircleUpIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface FundsSectionLayoutProps {
  children: ReactNode;
  handleOpenDeposit: () => void;
  /**
   * Token picker rendered beside the heading. Only the loaded view has a token
   * to select — the loading, error and empty states pass none.
   */
  tokenSelector?: ReactNode;
  /** Omitted by the loading, error and empty states: there is nothing to withdraw yet. */
  handleOpenWithdraw?: () => void;
}

const FundsSectionLayout = ({
  children,
  handleOpenDeposit,
  tokenSelector,
  handleOpenWithdraw,
}: FundsSectionLayoutProps) => (
  <div className='flex flex-col gap-4'>
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div className='flex items-baseline gap-3'>
        <h3 className='text-3xl font-medium text-foreground'>Funds overview</h3>
        {tokenSelector}
      </div>
      <div className='flex items-center gap-2'>
        {/* Arrows point the way the funds move: in on deposit, out on withdraw. */}
        <Button className='py-2' variant='primary' icon={ArrowCircleDownIcon} onClick={handleOpenDeposit}>
          Deposit
        </Button>
        {handleOpenWithdraw ? (
          <Button className='py-2' variant='ghost' icon={ArrowCircleUpIcon} onClick={handleOpenWithdraw}>
            Withdraw
          </Button>
        ) : null}
      </div>
    </div>
    {children}
  </div>
);

export default FundsSectionLayout;
