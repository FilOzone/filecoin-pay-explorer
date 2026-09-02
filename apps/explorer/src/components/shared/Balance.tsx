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
import { usePrivy } from "@privy-io/react-auth";
import { ArrowUpRightIcon, Check, Copy, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { type Address, erc20Abi, formatEther } from "viem";
import { useAccount, useBalance, useDisconnect, useReadContract, useWalletClient } from "wagmi";
import FilecoinLogo from "@/assests/FilecoinLogo";
import USDFCLogo from "@/assests/USDFCLogo";
import { isReviewEnabled, setReviewEnabled, useIsEmbeddedSigner } from "@/components/UserConsole/TransactionReview";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";

const Balance = () => {
  const { constants } = useSynapse();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { authenticated, logout } = usePrivy();
  const isEmbeddedSigner = useIsEmbeddedSigner();
  const [reviewOn, setReviewOn] = useState(() => isReviewEnabled());
  const { data: walletClient } = useWalletClient();
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='w-full justify-start md:w-fit'>
          <div className='flex items-center gap-3'>
            <Wallet className='size-4 text-zinc-500' />
            {isLoading ? (
              "Loading..."
            ) : (
              <>
                <span className='text-sm font-mono'>{address && formatAddress(address)}</span>
                <span className='flex items-center gap-1.5 text-sm'>
                  <FilecoinLogo className='size-4' /> {tFilBalanceFormatted}
                </span>
                <span className='flex items-center gap-1.5 text-sm'>
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
        <DropdownMenuItem
          onClick={() => {
            // Privy sessions (email/social/SIWE) need logout; a wagmi
            // disconnect alone would leave the session alive and re-connect
            // the wallet on reload. Connect-only wallets just disconnect.
            if (authenticated) {
              void logout();
            }
            disconnect();
          }}
          className='cursor-pointer py-2'
        >
          <LogOut />
          <span className='text-base text-zinc-950'>{authenticated ? "Log out" : "Disconnect"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className='text-zinc-600 py-2'>Tools</DropdownMenuLabel>
        <DropdownMenuItem onClick={addUsdfcToken} className='cursor-pointer'>
          <span className='text-base text-zinc-950'>Add USDFC Token</span>
        </DropdownMenuItem>
        {isEmbeddedSigner ? (
          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            onClick={() => {
              const next = !reviewOn;
              setReviewEnabled(next);
              setReviewOn(next);
            }}
            className='cursor-pointer py-2'
          >
            <ShieldCheck className={reviewOn ? "text-green-600" : "text-zinc-400"} />
            <span className='text-base text-zinc-950'>Review before signing: {reviewOn ? "On" : "Off"}</span>
          </DropdownMenuItem>
        ) : null}
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
