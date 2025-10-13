import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@filecoin-pay/ui/components/select";
import { useSwitchChain } from "wagmi";
import { supportedChains } from "@/services/wagmi/config";

interface NetworkOptionsProps {
  chainId: number;
  chainName?: string;
}

const NetworkOptions = ({ chainId }: NetworkOptionsProps) => {
  const { switchChain } = useSwitchChain();
  return (
    <Select value={chainId.toString()} onValueChange={(value) => switchChain({ chainId: parseInt(value) })}>
      <SelectTrigger className='w-[180px]'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {supportedChains.map((chain) => (
            <SelectItem className='px-4' key={chain.id} value={chain.id.toString()}>
              {chain.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default NetworkOptions;
