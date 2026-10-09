import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { supportedChains } from "@/services/wagmi/config";

const NetworkIndicator = () => {
  const currentChain = supportedChains[0];

  return (
    <span className='inline-flex items-center gap-1.5'>
      <span className='relative flex h-2 w-2'>
        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75'></span>
        <span className='relative inline-flex rounded-full h-2 w-2 bg-green-500'></span>
      </span>
      <Badge variant='primary'>{currentChain.label}</Badge>
    </span>
  );
};

export default NetworkIndicator;
