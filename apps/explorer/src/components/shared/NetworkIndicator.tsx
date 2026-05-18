import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { supportedChains } from "@/services/wagmi/config";
import { appConstants } from "@/utils/constants";

const NetworkIndicator = () => {
  const currentChain = supportedChains[0];
  const chainConfig = appConstants[currentChain.id];

  return (
    <span className='inline-flex items-center gap-1.5'>
      <span className='relative flex h-2 w-2'>
        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75'></span>
        <span className='relative inline-flex rounded-full h-2 w-2 bg-green-500'></span>
      </span>
      <Badge variant='primary'>{chainConfig.label}</Badge>
    </span>
  );
};

export default NetworkIndicator;
