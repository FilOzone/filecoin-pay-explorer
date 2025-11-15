"use client";
import { Button } from "@filecoin-pay/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@filecoin-pay/ui/components/dropdown-menu";
import { Check, Copy, ExternalLink, Wallet } from "lucide-react";
import { useState } from "react";
import { type Address, erc20Abi, formatEther } from "viem";
import { useAccount, useBalance, useDisconnect, useReadContract } from "wagmi";
import FilecoinLogo from "@/assests/FilecoinLogo";
import USDFCLogo from "@/assests/USDFCLogo";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";

const Balance = () => {
  const { constants } = useSynapse();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);
  const { data: tFilBalance, isLoading: isLoadingtFilBalance } = useBalance({
    address,
    query: { enabled: !!address },
  });
  const { data: usdfcBalance, isLoading: isLoadingUSDFCBalance } = useReadContract({
    address: constants.contracts.usdfc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address },
  });

  const usdfcBalanceFormatted = usdfcBalance ? Number(formatEther(usdfcBalance)).toFixed(2) : "0";
  const tFilBalanceFormatted = tFilBalance ? Number(formatEther(tFilBalance.value)).toFixed(2) : "0";
  const isLoading = isLoadingtFilBalance || isLoadingUSDFCBalance;

  const copyToClipboard = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const addUsdfcToken = async () => {
    try {
      if (window.ethereum) {
        await window.ethereum.request({
          method: "wallet_watchAsset",
          params: {
            type: "ERC20",
            options: {
              address: constants.contracts.usdfc,
              symbol: "USDFC",
              decimals: 18,
            },
          },
        });
      }
    } catch (error) {
      console.error("Failed to add token:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline'>
          <div className='flex items-center gap-2'>
            {isLoading ? (
              "Loading..."
            ) : (
              <>
                {tFilBalanceFormatted} <FilecoinLogo className='w-4 h-4' /> {usdfcBalanceFormatted}{" "}
                <USDFCLogo className='w-4 h-4' />
              </>
            )}{" "}
            <Wallet className='w-4 h-4' />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='start'>
        <DropdownMenuLabel>Wallet</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={copyToClipboard} className='cursor-pointer'>
          <div className='flex items-center justify-between w-full'>
            <span className='text-sm'>{address && formatAddress(address)}</span>
            {copied ? <Check className='w-4 h-4 text-green-500' /> : <Copy className='w-4 h-4' />}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <div className='flex items-center justify-between w-full'>
            <span className='text-sm'>{tFilBalanceFormatted} FIL</span>
            <FilecoinLogo className='w-4 h-4' />
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <div className='flex items-center justify-between w-full'>
            <span className='text-sm'>{usdfcBalanceFormatted} USDFC</span>
            <USDFCLogo className='w-4 h-4' />
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={addUsdfcToken} className='cursor-pointer'>
          <span className='text-sm'>Add USDFC Token</span>
        </DropdownMenuItem>
        {constants.faucets?.map((faucet) => (
          <DropdownMenuItem asChild key={faucet.name}>
            <a
              href={faucet.url}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center justify-between w-full cursor-pointer'
            >
              <span className='text-sm'>{faucet.name}</span>
              <ExternalLink className='w-4 h-4' />
            </a>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => disconnect()} className='cursor-pointer'>
          <span className='text-sm'>Disconnect</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Balance;
