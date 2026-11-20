"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Address, erc20Abi, multicall3Abi } from "viem";
import { useReadContracts } from "wagmi";
import { mainnet } from "@/constants/chains";
import { isLinkedWallet } from "./console-wallet";
import { useFundingLaunch } from "./providers/FundingLaunchContext";

export function SignInFundingPrompt({ address }: { address?: Address }) {
  const { user } = usePrivy();
  const [signedInUser, setSignedInUser] = useState<string | null>(null);
  const userTookAction = useRef(false);
  const { isAddFundsOpen, isSquidOpen, openAddFunds } = useFundingLaunch();
  useLogin({
    onComplete: ({ user, wasAlreadyAuthenticated, loginMethod, loginAccount }) => {
      if (wasAlreadyAuthenticated) return;
      const method = loginMethod ?? loginAccount?.type;
      userTookAction.current = false;
      setSignedInUser(method === "email" || method === "google" || method === "google_oauth" ? user.id : null);
    },
  });

  useEffect(() => {
    if (isAddFundsOpen || isSquidOpen) setSignedInUser(null);
  }, [isAddFundsOpen, isSquidOpen]);

  useEffect(() => {
    if (!signedInUser) return;
    // Let a menu or link the user chose keep focus while identity and balances finish loading.
    const onActivation = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest(
        'button, a[href], input, select, textarea, summary, [role="button"], [role="menuitem"]',
      );
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
      if (event instanceof KeyboardEvent) {
        const opensMenu = event.key === "ArrowDown" && control.hasAttribute("aria-haspopup");
        if (event.key !== "Enter" && event.key !== " " && !opensMenu) return;
      }
      userTookAction.current = true;
      setSignedInUser(null);
    };
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    document.addEventListener("pointerdown", onActivation, options);
    document.addEventListener("keydown", onActivation, options);
    document.addEventListener("click", onActivation, options);
    return () => controller.abort();
  }, [signedInUser]);

  const finish = useCallback(
    (empty: boolean) => {
      setSignedInUser(null);
      if (empty && !userTookAction.current) openAddFunds();
    },
    [openAddFunds],
  );

  // Login can finish before Privy has attached the new wallet or wagmi has connected it.
  if (!address || signedInUser !== user?.id || !isLinkedWallet(user, address) || isAddFundsOpen || isSquidOpen) {
    return null;
  }
  return <CheckFundingBalance address={address} key={address} onResult={finish} />;
}

function CheckFundingBalance({ address, onResult }: { address: Address; onResult: (empty: boolean) => void }) {
  const { multicall3, usdfc, payments } = mainnet.contracts;
  const { data, isError, isFetchedAfterMount, isFetching } = useReadContracts({
    allowFailure: false,
    chainId: mainnet.id,
    contracts: [
      { address: multicall3.address, abi: multicall3Abi, functionName: "getEthBalance", args: [address] },
      { address: usdfc.address, abi: erc20Abi, functionName: "balanceOf", args: [address] },
      { address: payments.address, abi: payments.abi, functionName: "accounts", args: [usdfc.address, address] },
    ],
    query: { refetchOnMount: "always", refetchOnWindowFocus: false, retry: 1 },
  });
  useEffect(() => {
    // A previous session's cached zeros and an unreadable balance cannot establish an empty wallet.
    if (!isFetchedAfterMount || isFetching) return;
    onResult(!isError && data?.[0] === 0n && data[1] === 0n && data[2][0] === 0n);
  }, [data, isError, isFetchedAfterMount, isFetching, onResult]);
  return null;
}
