import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Plus } from "lucide-react";
import { BASE_DOMAIN } from "@/constants/site-metadata";

interface ApprovalSectionLayoutProps {
  children: React.ReactNode;
  handleOpenApprove: () => void;
}

function ApprovalSectionLayout({ children, handleOpenApprove }: ApprovalSectionLayoutProps) {
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <h3 className='text-2xl font-medium'>Authorized Services</h3>
        <Button baseDomain={BASE_DOMAIN} variant='primary' onClick={handleOpenApprove} className='py-2'>
          <span className='flex items-center gap-2'>
            <Plus className='h-4 w-4' />
            Approve Service
          </span>
        </Button>
      </div>
      {children}
    </div>
  );
}

export default ApprovalSectionLayout;
