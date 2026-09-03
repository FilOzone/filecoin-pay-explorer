"use client";
import { Button } from "@filecoin-pay/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@filecoin-pay/ui/components/dropdown-menu";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { useExportWallet, usePrivy } from "@privy-io/react-auth";
import { ArrowUpRightIcon, Check, Coins, Copy, KeyRound, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { type Address, erc20Abi, formatEther } from "viem";
import { useAccount, useBalance, useDisconnect, useReadContract, useWalletClient } from "wagmi";
import FilecoinLogo from "@/assests/FilecoinLogo";
import USDFCLogo from "@/assests/USDFCLogo";
import { useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import { isReviewEnabled, setReviewEnabled, useIsEmbeddedSigner } from "@/components/UserConsole/TransactionReview";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";

/**
 * The wallet pill and its menu: the address (click to copy), the way to add
 * funds, wallet settings, and last of all the way out.
 */
const Balance = () => {
  const { constants } = useSynapse();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { authenticated, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  // The picker behind Add funds already shows only what the current network supports.
  const { openAddFunds } = useFundingLaunch();
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

  const usdfcBalanceFormatted = Number(formatEther(usdfcBalance ?? 0n)).toFixed(2);
  const tFilBalanceFormatted = Number(formatEther(tFilBalance?.value ?? 0n)).toFixed(2);
  const isLoading = isLoadingtFilBalance || isLoadingUSDFCBalance;
  const shortAddress = address ? formatAddress(address) : "";

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

  const signOut = () => {
    // Privy sessions (email/social/SIWE) need logout; a wagmi disconnect alone
    // would leave the session alive and re-connect the wallet on reload.
    // Connect-only wallets just disconnect.
    if (authenticated) void logout();
    disconnect();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='min-w-0 flex-1 justify-start md:flex-none md:w-fit'>
          {/* On a phone the pill shares a row with the network switcher; the glyph goes, the numbers stay. */}
          <div className='flex items-center gap-2 sm:gap-3'>
            <Wallet className='hidden size-4 text-muted-foreground sm:block' />
            {isLoading ? (
              <>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-12' />
                <Skeleton className='h-4 w-12' />
              </>
            ) : (
              <>
                <span className='font-mono text-sm'>{shortAddress}</span>
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
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={copyToClipboard}
          className='cursor-pointer py-2'
        >
          <Copy />
          <span className='font-mono text-base'>{shortAddress}</span>
          {copied ? <Check className='ml-auto text-primary' /> : null}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openAddFunds()} className='cursor-pointer py-2'>
          <Coins />
          <span className='text-base'>Add funds</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className='py-2 text-muted-foreground'>Settings</DropdownMenuLabel>
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
              <ShieldCheck className={reviewOn ? "text-primary" : "text-muted-foreground"} />
              <span className='text-base'>Review before signing: {reviewOn ? "On" : "Off"}</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={addUsdfcToken} className='cursor-pointer py-2'>
            <Wallet />
            <span className='text-base'>Add USDFC to wallet</span>
          </DropdownMenuItem>
          {isEmbeddedSigner ? (
            <DropdownMenuItem onClick={() => void exportWallet()} className='cursor-pointer py-2'>
              <KeyRound />
              <span className='text-base'>Export wallet key</span>
            </DropdownMenuItem>
          ) : null}
          {constants.faucets?.map((faucet) => (
            <DropdownMenuItem asChild key={faucet.name} className='py-2'>
              <a href={faucet.url} target='_blank' rel='noopener noreferrer' className='w-full cursor-pointer'>
                <span className='text-base'>{faucet.name}</span>
                <ArrowUpRightIcon className='text-muted-foreground' size={16} />
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className='cursor-pointer py-2'>
          <LogOut />
          <span className='text-base'>{authenticated ? "Log out" : "Disconnect"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Balance;
