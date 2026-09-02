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
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Repeat } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { useConnection } from "wagmi";
import AddServiceDialog from "@/components/UserConsole/AddServiceDialog";
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

export function PocBaseUsdcOnboarding() {
  const { address } = useConnection();
  const { constants } = useSynapse();
  const searchParams = useSearchParams();
  const [swapOpen, setSwapOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"form" | "swapping" | "done">("form");

  // Demo override: a fresh embedded wallet holds no real Base USDC, and no rule
  // lets the agent fund one, so ?pocBaseUsdc=25 simulates the detection.
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
  const isSimulatedBalance = override !== null;

  if (!address || balance <= 0) return null;

  const balanceLabel = balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const parsedAmount = Number.parseFloat(amount);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance;
  const receiveEstimate = validAmount ? (parsedAmount * SIMULATED_RATE).toFixed(2) : null;

  const openSwap = () => {
    setAmount(String(balance));
    setPhase("form");
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
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Indicative rate ({SIMULATED_RATE} USDFC per USDC) standing in for a live Squid quote.
                  </p>
                </div>
              )}
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
                  {receiveEstimate} USDFC arrived in your wallet <em>(simulated)</em>.
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
                Swap (simulated)
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
