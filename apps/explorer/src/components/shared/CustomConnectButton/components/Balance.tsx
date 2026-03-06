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
import { ArrowUpRightIcon, CopyIcon, SignOutIcon, WalletIcon } from "@phosphor-icons/react";
import { Check } from "lucide-react";
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
            <WalletIcon color='var(--color-zinc-400)' size={20} className='w-5 h-5' />
            {isLoading ? (
              "Loading..."
            ) : (
              <>
                {tFilBalanceFormatted} <FilecoinLogo className='w-4 h-4' /> {usdfcBalanceFormatted}{" "}
                <USDFCLogo className='w-4 h-4' />
              </>
            )}{" "}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-64' align='start'>
        <DropdownMenuLabel className='text-zinc-600 text-sm py-2'>Wallet</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={copyToClipboard}
          className='cursor-pointer py-2'
        >
          <div className='flex items-center w-full gap-2'>
            <div className='flex items-center gap-2'>
              <WalletIcon color='var(--color-zinc-400)' size={20} />
              <span className='text-base text-zinc-950'>{address && formatAddress(address)}</span>
            </div>
            {copied ? (
              <Check className='w-4 h-4 text-green-500' />
            ) : (
              <CopyIcon color='var(--color-zinc-400)' size={16} />
            )}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnect()} className='cursor-pointer py-2'>
          <SignOutIcon className='w-5 h-5' />
          <span className='text-base text-zinc-950'>Disconnect</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className='text-zinc-600 text-sm py-2'>Tools</DropdownMenuLabel>
        <DropdownMenuItem onClick={addUsdfcToken} className='cursor-pointer'>
          <span className='text-base text-zinc-950'>Add USDFC Token</span>
        </DropdownMenuItem>
        {constants.faucets?.map((faucet) => (
          <DropdownMenuItem asChild key={faucet.name} className='py-2'>
            <a
              href={faucet.url}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center w-full gap-2 cursor-pointer'
            >
              <span className='text-base text-zinc-950'>{faucet.name}</span>
              <ArrowUpRightIcon color='var(--color-zinc-400)' size={16} />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Balance;
