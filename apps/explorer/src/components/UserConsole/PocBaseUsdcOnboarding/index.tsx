"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import { useAddFunds, usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Repeat } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { useConnection, usePublicClient } from "wagmi";
import AddServiceDialog from "@/components/UserConsole/AddServiceDialog";
import { mainnet } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";

/**
 * POC: onboarding rail for a freshly logged-in (Privy email/social) user whose
 * only asset is USDC on Base - no FIL, no USDFC. Detects the Base balance with
 * a real read, then walks swap -> deposit + add service.
 *
 * The swap execution is SIMULATED here because the console demos on
 * calibration and Squid only routes to Filecoin mainnet. On mainnet this step
 * is the existing guided top-up (GuidedTopUpDialog), which already executes
 * the Squid route in-console; this component would collapse into a banner
 * that opens it. Everything downstream of the swap (deposit + operator
 * approval through AddServiceDialog) is real.
 */

// Native USDC on Base.
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_USDC_DECIMALS = 6;
const BASE_RPC_URL = "https://mainnet.base.org";

// Public read-only client; Base is intentionally not part of the wagmi config
// on testnet, and this read works without a chain object.
const baseReadClient = createPublicClient({ transport: http(BASE_RPC_URL) });

// Indicative only, mirroring a typical Squid USDC->USDFC quote shape.
const SIMULATED_RATE = 0.997;

// Issue #377 default: covers a heavy month of client gas and the worst
// observed base-fee spike (0.19 FIL).
const POC_FIL_BUNDLE = "0.25";

function PocBadge() {
  return (
    <span className='rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700'>
      POC &middot; simulated
    </span>
  );
}

async function readBaseUsdc(address: string): Promise<bigint> {
  return baseReadClient.readContract({
    address: BASE_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
}

/**
 * Shared detection: real Base-USDC balance for the connected address, with
 * the ?pocBaseUsdc= demo override. Used by the page-level rail and by the
 * inline hint inside the add-service dialog.
 */
function useBaseUsdcDetection() {
  const { address } = useConnection();
  const searchParams = useSearchParams();
  const overrideParam = searchParams.get("pocBaseUsdc");
  const override = overrideParam && Number.parseFloat(overrideParam) > 0 ? Number.parseFloat(overrideParam) : null;

  const { data: realBalance } = useQuery({
    queryKey: ["poc-base-usdc", address],
    queryFn: () => readBaseUsdc(address as string),
    enabled: Boolean(address) && override === null,
    staleTime: 60_000,
    retry: 1,
  });

  const balance = override ?? (realBalance !== undefined ? Number(formatUnits(realBalance, BASE_USDC_DECIMALS)) : 0);
  return { address, balance, isSimulatedBalance: override !== null };
}

const OPEN_SWAP_EVENT = "poc-open-swap";

/**
 * Inline entry point for the swap flow, rendered inside the add-service
 * dialog when the wallet lacks USDFC but holds USDC on Base. Dispatches to
 * the page-level rail (which owns the swap dialog) so there is exactly one
 * swap surface.
 */
export function PocSwapHint({ onNavigate, visible }: { onNavigate?: () => void; visible: boolean }) {
  const { balance } = useBaseUsdcDetection();
  if (!visible || balance <= 0) return null;
  const balanceLabel = balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs'>
      <span className='flex items-center gap-2'>
        <Repeat className='h-3.5 w-3.5 shrink-0 text-amber-700' />
        <span>
          No USDFC yet? You have <b>{balanceLabel} USDC on Base</b> - swap it first.
        </span>
        <PocBadge />
      </span>
      <Button
        onClick={() => {
          onNavigate?.();
          window.dispatchEvent(new Event(OPEN_SWAP_EVENT));
        }}
        size='compact'
        type='button'
        variant='tertiary'
      >
        Swap to USDFC
      </Button>
    </div>
  );
}

export function PocBaseUsdcOnboarding() {
  const { authenticated } = usePrivy();
  const { addFunds } = useAddFunds();
  const { constants } = useSynapse();
  const searchParams = useSearchParams();
  const [isFunding, setIsFunding] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"form" | "swapping" | "done">("form");

  const { address, balance, isSimulatedBalance } = useBaseUsdcDetection();
  const { chainId } = useConnection();
  const router = useRouter();
  const pathname = usePathname();
  const filecoinClient = usePublicClient();
  const [includeFil, setIncludeFil] = useState(true);

  // Issue #377: FIL for gas rides along with the swap. The wallet's native
  // FIL balance on the active Filecoin chain decides the checkbox default.
  const { data: filBalance } = useQuery({
    queryKey: ["poc-fil-balance", address, chainId],
    queryFn: () => filecoinClient?.getBalance({ address: address as `0x${string}` }),
    enabled: Boolean(address) && Boolean(filecoinClient),
    staleTime: 60_000,
    retry: 1,
  });

  // The add-service dialog's inline hint opens the swap flow through this
  // event, so the page owns a single swap dialog.
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  useEffect(() => {
    const handler = () => {
      if (balanceRef.current <= 0) return;
      setAmount(String(balanceRef.current));
      setPhase("form");
      setSwapOpen(true);
    };
    window.addEventListener(OPEN_SWAP_EVENT, handler);
    return () => window.removeEventListener(OPEN_SWAP_EVENT, handler);
  }, []);

  // Privy's unified funding modal (card onramp, exchange transfer, crypto
  // deposit - whichever methods the dashboard enables), targeting USDC on
  // Base for the connected wallet. Real money, paid by the user in their own
  // browser; nothing here signs or moves funds itself.
  // Experiment knob: ?pocFundAsset=usdfc|fil retargets the destination at
  // Filecoin mainnet (eip155:314) to probe whether Privy/Relay can deliver
  // USDFC or native FIL directly - answering "can we skip the swap leg?".
  const fundAssetParam = searchParams.get("pocFundAsset");
  const fundDestination =
    fundAssetParam === "usdfc"
      ? { chain: "eip155:314" as const, asset: "0x80B98d3aa09ffff255c3ba4A241111Ff1262F045" }
      : fundAssetParam === "fil"
        ? { chain: "eip155:314" as const, asset: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" }
        : { chain: "eip155:8453" as const, asset: BASE_USDC_ADDRESS };
  const getUsdcWithPrivy = async () => {
    if (!address || isFunding) return;
    setIsFunding(true);
    try {
      await addFunds({
        destination: { address, ...fundDestination },
        fiat: { defaultAmount: "5" },
        crypto: {},
      });
    } catch {
      // User exited the flow; nothing to clean up.
    } finally {
      setIsFunding(false);
    }
  };

  if (!address) return null;

  // Fresh wallet, nothing on Base yet: for Privy-authenticated users, offer
  // Privy funding as the entry point instead of hiding the rail entirely.
  if (balance <= 0) {
    if (!authenticated) return null;
    return (
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/60 p-4'>
        <div className='flex items-start gap-3'>
          <span className='mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700'>
            <Repeat className='h-4 w-4' />
          </span>
          <div>
            <p className='flex items-center gap-2 font-medium'>
              Fund your wallet to get started
              <PocBadge />
            </p>
            <p className='text-sm text-muted-foreground'>
              Get USDC on Base with a card, an exchange transfer, or a crypto deposit - then swap it to USDFC here. No
              FIL needed.
            </p>
          </div>
        </div>
        <Button disabled={isFunding} onClick={() => void getUsdcWithPrivy()} size='compact' variant='primary'>
          <span className='flex items-center gap-2'>
            {isFunding ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            Get USDC via Privy
          </span>
        </Button>
      </div>
    );
  }

  const balanceLabel = balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const parsedAmount = Number.parseFloat(amount);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance;
  const receiveEstimate = validAmount ? (parsedAmount * SIMULATED_RATE).toFixed(2) : null;

  // On Filecoin mainnet the real in-console Squid flow exists (guided top-up,
  // ?topUp=1): route there so the swap executes for real. The simulated
  // dialog is the testnet stand-in only - Squid has no calibration support.
  // FIL bundling (issue #377) applies to both: simulated here, and in
  // squid-evm-funding as a second same-chain requirement for the real leg.
  const openSwap = () => {
    if (chainId === mainnet.id) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("topUp", "1");
      router.replace(`${pathname}?${params.toString()}`);
      return;
    }
    setAmount(String(balance));
    setPhase("form");
    // Issue #377 defaults: no FIL in the wallet (or unreadable balance) ->
    // bundle 0.25 FIL; wallet already has FIL -> opt out.
    setIncludeFil(!(filBalance !== undefined && filBalance > 0n));
    setSwapOpen(true);
  };

  const runSimulatedSwap = () => {
    if (!validAmount) return;
    setPhase("swapping");
    window.setTimeout(() => setPhase("done"), 2_400);
  };

  const handleSwapOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && phase === "swapping") return;
    setSwapOpen(nextOpen);
  };

  const continueToAddService = () => {
    setSwapOpen(false);
    setAddServiceOpen(true);
  };

  return (
    <>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/60 p-4'>
        <div className='flex items-start gap-3'>
          <span className='mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700'>
            <Repeat className='h-4 w-4' />
          </span>
          <div>
            <p className='flex items-center gap-2 font-medium'>
              You have {balanceLabel} USDC on Base
              <PocBadge />
            </p>
            <p className='text-sm text-muted-foreground'>
              Swap it to USDFC to fund your Filecoin Pay account and start using services - no FIL needed.
              {isSimulatedBalance ? " (Balance injected via ?pocBaseUsdc for the demo.)" : ""}
            </p>
          </div>
        </div>
        <Button onClick={openSwap} size='compact' variant='primary'>
          <span className='flex items-center gap-2'>
            Swap to USDFC
            <ArrowRight className='h-4 w-4' />
          </span>
        </Button>
      </div>

      <Dialog open={swapOpen} onOpenChange={handleSwapOpenChange}>
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              Swap USDC on Base to USDFC
              <PocBadge />
            </DialogTitle>
            <DialogDescription>
              On mainnet this runs the in-console Squid route (guided top-up). On this test network the swap execution
              is simulated; every step after it is real.
            </DialogDescription>
          </DialogHeader>

          {phase === "form" && (
            <div className='grid gap-4'>
              <div className='grid gap-2'>
                <Label htmlFor='poc-swap-amount'>USDC to swap (available: {balanceLabel})</Label>
                <Input id='poc-swap-amount' min='0' onChange={setAmount} step='any' type='number' value={amount} />
                {amount !== "" && !validAmount && (
                  <p className='text-sm text-destructive'>Enter an amount between 0 and {balanceLabel}.</p>
                )}
              </div>
              {receiveEstimate && (
                <div className='rounded-md border p-3 text-sm'>
                  <p className='flex items-center justify-between'>
                    <span className='text-muted-foreground'>You receive (est.)</span>
                    <span className='font-medium'>{receiveEstimate} USDFC</span>
                  </p>
                  {includeFil && (
                    <p className='flex items-center justify-between'>
                      <span className='text-muted-foreground'>+ network fees (FIL)</span>
                      <span className='font-medium'>{POC_FIL_BUNDLE} FIL</span>
                    </p>
                  )}
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Indicative rate ({SIMULATED_RATE} USDFC per USDC) standing in for a live Squid quote.
                  </p>
                </div>
              )}
              {/* Issue #377: bundle FIL for gas so a zero-FIL wallet can actually
                  submit the deposit after the swap. */}
              <label className='flex items-start gap-2 text-sm'>
                <input
                  checked={includeFil}
                  className='mt-1'
                  onChange={(event) => setIncludeFil(event.target.checked)}
                  type='checkbox'
                />
                <span>
                  Include {POC_FIL_BUNDLE} FIL for transaction fees
                  <span className='mt-0.5 block text-xs text-muted-foreground'>
                    {filBalance !== undefined && filBalance > 0n
                      ? "You already have FIL for fees."
                      : "Your wallet has no FIL. Filecoin transactions (like depositing USDFC) need a small amount of FIL. This covers about a month of typical activity. The FIL goes to your wallet to pay network fees - not to your Filecoin Pay balance."}
                  </span>
                </span>
              </label>
            </div>
          )}

          {phase === "swapping" && (
            <div className='flex flex-col items-center gap-3 py-6'>
              <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
              <p className='text-sm text-muted-foreground'>
                Simulating swap: USDC (Base) &rarr; USDFC (Filecoin)&hellip;
              </p>
            </div>
          )}

          {phase === "done" && (
            <div className='grid gap-3'>
              <div className='flex items-center gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm'>
                <Check className='h-4 w-4 text-green-700' />
                <span>
                  {receiveEstimate} USDFC{includeFil ? ` and ${POC_FIL_BUNDLE} FIL (for network fees)` : ""} arrived in
                  your wallet <em>(simulated)</em>.
                </span>
              </div>
              {constants.faucets && constants.faucets.length > 0 && (
                <p className='text-xs text-muted-foreground'>
                  Simulated arrivals do not mint test tokens. To run the next step for real on this network, grab USDFC
                  (and a little FIL for the permit-less path) from the faucets in the wallet menu, or{" "}
                  <a
                    className='underline underline-offset-2'
                    href={constants.faucets[0].url}
                    rel='noopener noreferrer'
                    target='_blank'
                  >
                    open the faucet
                  </a>
                  .
                </p>
              )}
              <p className='text-sm'>Next: deposit it and add a service - one transaction.</p>
            </div>
          )}

          <DialogFooter>
            <Button disabled={phase === "swapping"} onClick={() => setSwapOpen(false)} variant='ghost'>
              Cancel
            </Button>
            {phase === "form" && (
              <Button disabled={!validAmount} onClick={runSimulatedSwap} variant='primary'>
                {includeFil ? "Swap for USDFC + FIL (simulated)" : "Swap for USDFC (simulated)"}
              </Button>
            )}
            {phase === "done" && (
              <Button onClick={continueToAddService} variant='primary'>
                Deposit &amp; add a service
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddServiceDialog open={addServiceOpen} onOpenChange={setAddServiceOpen} />
    </>
  );
}

export default PocBaseUsdcOnboarding;
