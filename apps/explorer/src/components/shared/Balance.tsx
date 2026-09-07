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
import { useWallets } from "@privy-io/react-auth";
import { ArrowUpRightIcon, Check, Copy, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type Address, erc20Abi, formatEther } from "viem";
import { useAccount, useBalance, useReadContract, useWalletClient } from "wagmi";
import FilecoinLogo from "@/assests/FilecoinLogo";
import USDFCLogo from "@/assests/USDFCLogo";
import { WALLET_EXIT_LABEL } from "@/components/shared/CustomConnectButton/state";
import { useWalletExit } from "@/components/shared/CustomConnectButton/useWalletExit";
import { useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";

const Balance = () => {
  const { constants } = useSynapse();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { data: walletClient } = useWalletClient();
  const activeWallet = wallets.find((candidate) => candidate.address.toLowerCase() === address?.toLowerCase());
  const { action: exitAction, exit } = useWalletExit(activeWallet);
  const [copied, setCopied] = useState(false);
  const { openAddFunds } = useFundingLaunch();
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
    if (!walletClient) return;
    try {
      await walletClient.watchAsset({
        type: "ERC20",
        options: {
          address: constants.contracts.usdfc,
          symbol: "USDFC",
          decimals: 18,
        },
      });
    } catch (error) {
      console.error("Failed to add token:", error);
    }
  };

  const exitWallet = async () => {
    try {
      await exit();
      // Browser extensions cannot be disconnected programmatically; the site stays authorised until revoked there.
      if (exitAction === "manual-disconnect") toast.info("Also disconnect this site from your wallet extension");
    } catch (error) {
      toast.error(exitAction === "logout" ? "Unable to log out" : "Unable to disconnect wallet", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='min-w-0 flex-1 justify-start overflow-hidden md:w-fit md:flex-none'>
          <div className='flex min-w-0 items-center gap-3'>
            <Wallet className='size-4 text-muted-foreground' />
            {isLoading ? (
              "Loading..."
            ) : (
              <>
                <span className='truncate text-sm font-mono'>{address && formatAddress(address)}</span>
                <span className='hidden items-center gap-1.5 text-sm sm:flex'>
                  <FilecoinLogo className='size-4' /> {tFilBalanceFormatted}
                </span>
                <span className='hidden items-center gap-1.5 text-sm sm:flex'>
                  <USDFCLogo className='size-4' /> {usdfcBalanceFormatted}
                </span>
              </>
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-64' align='start'>
        <DropdownMenuLabel className='text-zinc-600 py-2'>Wallet</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={copyToClipboard}
          className='cursor-pointer py-2'
        >
          <Copy />
          <span className='text-base text-zinc-950 font-mono'>{address && formatAddress(address)}</span>
          {copied && <Check className='text-green-500 ml-auto' />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exitWallet()} className='cursor-pointer py-2'>
          <LogOut />
          <span className='text-base text-zinc-950'>{WALLET_EXIT_LABEL[exitAction]}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className='text-zinc-600 py-2'>Tools</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => openAddFunds()} className='cursor-pointer'>
          <span className='text-base text-zinc-950'>Add funds</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={addUsdfcToken} className='cursor-pointer'>
          <span className='text-base text-zinc-950'>Add USDFC Token</span>
        </DropdownMenuItem>
        {constants.faucets?.map((faucet) => (
          <DropdownMenuItem asChild key={faucet.name} className='py-2'>
            <a href={faucet.url} target='_blank' rel='noopener noreferrer' className='w-full cursor-pointer'>
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
