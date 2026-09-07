import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@filecoin-pay/ui/components/select";
import { AlertCircle, CheckCircle2, Users } from "lucide-react";
import CopyButton from "@/components/shared/CopyButton";
import ExplorerLink from "@/components/shared/ExplorerLink";
import type { ApprovableService } from "@/hooks/useApprovableServices";
import { formatAddress } from "@/utils/formatter";
import { CUSTOM_OPTION, type ServiceSelection } from "../hooks";

const ServiceDetailsCard: React.FC<{ service: ApprovableService; explorerUrl?: string }> = ({
  service,
  explorerUrl,
}) => (
  <div className='rounded-lg bg-primary/10 p-3 space-y-1.5 text-xs'>
    <div className='flex items-center justify-between'>
      <span className='font-medium text-sm'>{service.name}</span>
      <span className='flex items-center gap-1 text-muted-foreground'>
        <Users className='h-3 w-3' />
        {service.payerCount} users
      </span>
    </div>
    {service.description && <p className='text-muted-foreground'>{service.description}</p>}
    <div className='flex items-center gap-1 text-muted-foreground'>
      <span>Contract:</span>
      <ExplorerLink address={service.address} explorerUrl={explorerUrl} pinned label='Contract address' />
    </div>
    {/* Homepage is untrusted contract text: plain text with a copy affordance, never a hyperlink. */}
    {service.homepage && (
      <div className='flex items-center gap-1 text-muted-foreground'>
        <span>Homepage:</span>
        <span className='select-all'>
          {service.homepage.length > 36 ? `${service.homepage.slice(0, 36)}…` : service.homepage}
        </span>
        <CopyButton value={service.homepage} tooltipText='Copy homepage URL' />
      </div>
    )}
  </div>
);

export interface ServiceSelectorProps {
  selection: ServiceSelection;
  explorerUrl?: string;
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({ selection, explorerUrl }) => {
  const { services, isLoadingServices, serviceChoice, selectedService, operatorAddress } = selection;
  const isCustomAddressValid = !!operatorAddress;

  return (
    <div className='grid gap-3'>
      <Label htmlFor='service'>Select Service</Label>
      <Select value={serviceChoice} onValueChange={selection.chooseService}>
        <SelectTrigger id='service' className='w-full'>
          <SelectValue placeholder={isLoadingServices ? "Loading services…" : "Choose a service…"} />
        </SelectTrigger>
        <SelectContent>
          {services.map((service) => (
            <SelectItem key={service.address} value={service.address}>
              <span className='flex items-center gap-2'>
                <span>{service.name}</span>
                <span className='font-mono text-xs text-muted-foreground'>({formatAddress(service.address)})</span>
              </span>
            </SelectItem>
          ))}
          {services.length > 0 && <SelectSeparator />}
          <SelectItem value={CUSTOM_OPTION}>Custom service address…</SelectItem>
        </SelectContent>
      </Select>

      {selectedService && <ServiceDetailsCard service={selectedService} explorerUrl={explorerUrl} />}

      {serviceChoice === CUSTOM_OPTION && (
        <div className='grid gap-2'>
          <Input
            id='customService'
            placeholder='Service contract address 0x…'
            value={selection.customServiceInput}
            onChange={selection.enterCustomServiceAddress}
          />
          {selection.customServiceInput &&
            (isCustomAddressValid ? (
              <div className='flex items-center gap-2 text-sm text-green-600 dark:text-green-400'>
                <CheckCircle2 className='h-4 w-4' />
                <span>Valid service address</span>
              </div>
            ) : (
              <div className='flex items-center gap-2 text-sm text-destructive'>
                <AlertCircle className='h-4 w-4' />
                <span>Invalid address format</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
