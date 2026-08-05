"use client";
import { Button } from "@filecoin-pay/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@filecoin-pay/ui/components/dropdown-menu";
import { ChevronDown, Globe } from "lucide-react";
import { useSwitchChain } from "wagmi";
import { supportedChains } from "@/services/wagmi/config";
import { getNetworkFromChainId } from "@/utils/network";

interface ChainSwitcherProps {
  chainId: number;
}

const ChainSwitcher = ({ chainId }: ChainSwitcherProps) => {
  const { switchChain } = useSwitchChain();
  const currentNetwork = getNetworkFromChainId(chainId);
  const currentChain = supportedChains.find((c) => c.slug === currentNetwork) ?? supportedChains[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='w-full justify-between sm:w-fit'>
          <span className='flex items-center gap-2'>
            <Globe className='size-4 text-zinc-500' />
            {currentChain.label}
          </span>
          <ChevronDown className='size-4 text-zinc-500' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {supportedChains.map((chain) => (
          <DropdownMenuItem
            key={chain.id}
            onClick={() => switchChain({ chainId: chain.id })}
            className={chain.id === chainId ? "font-semibold" : ""}
          >
            {chain.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ChainSwitcher;
