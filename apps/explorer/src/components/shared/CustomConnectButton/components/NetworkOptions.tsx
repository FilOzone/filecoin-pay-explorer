import { Listbox } from "@filecoin-foundation/ui-filecoin/Listbox";
import { GlobeIcon } from "lucide-react";
import { useSwitchChain } from "wagmi";
import { getChain } from "@/constants/chains";
import { supportedChains } from "@/services/wagmi/config";
import { getNetworkFromChainId } from "@/utils/network";

interface NetworkOptionsProps {
  chainId: number;
  chainName?: string;
}

const NetworkOptions = ({ chainId }: NetworkOptionsProps) => {
  const { switchChain } = useSwitchChain();
  return (
    <Listbox
      Icon={GlobeIcon}
      options={supportedChains}
      selected={getChain(getNetworkFromChainId(chainId))}
      setSelected={(option) => switchChain({ chainId: option.id })}
    />
  );
};

export default NetworkOptions;
