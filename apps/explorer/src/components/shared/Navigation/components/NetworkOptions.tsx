import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@filecoin-pay/ui/components/select";
import { GlobeIcon } from "@phosphor-icons/react";
import { supportedChains } from "@/services/wagmi/config";

interface NetworkOptionsProps {
  chainId: number;
  chainName?: string;
}

const NetworkOptions = ({ chainId }: NetworkOptionsProps) => {
  // TODO: Add chain switcher

  return (
    <Select value={chainId.toString()} onValueChange={() => console.log("Calibration is only supported chain!")}>
      <SelectTrigger className='w-[172px] py-6 pr-4 pl-4'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {supportedChains.map((chain) => (
            <SelectItem key={chain.id} value={chain.id.toString()}>
              <div className='flex items-center gap-2 py-2'>
                <GlobeIcon className='h-5 w-5 text-zinc-400' />
                <span className={"text-base font-semibold"}>{chain.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default NetworkOptions;
