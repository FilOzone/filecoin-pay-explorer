import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Plus } from "lucide-react";

interface ServicesSectionLayoutProps {
  children: React.ReactNode;
  onAddService: () => void;
}

const ServicesSectionLayout = ({ children, onAddService }: ServicesSectionLayoutProps) => (
  <div className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <h3 className='text-2xl font-medium'>Your Services</h3>
      <Button variant='primary' onClick={onAddService} className='py-2'>
        <span className='flex items-center gap-2'>
          <Plus className='h-4 w-4' />
          Add Service
        </span>
      </Button>
    </div>
    {children}
  </div>
);

export default ServicesSectionLayout;
