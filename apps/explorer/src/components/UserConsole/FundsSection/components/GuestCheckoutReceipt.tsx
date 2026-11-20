import { ArrowRight, ChevronDown, CreditCard, ReceiptText } from "lucide-react";
import { formatUnits } from "viem";
import type { GuestCoinbaseQuote } from "@/app/api/coinbase/quote/quote";
import FilecoinLogo from "@/assests/FilecoinLogo";
import USDFCLogo from "@/assests/USDFCLogo";
import { formatTokenTruncated } from "@/utils/formatter";
import type { GuestRouteEstimate } from "../data/guestRoute";

type ReceiptProps = { mode: "example" } | { mode: "estimate"; quote: GuestCoinbaseQuote; route?: GuestRouteEstimate };

// Display-only amounts from the recorded $5 browser fixture. They never enter a quote or route request.
const walkthrough = {
  quote: { paymentTotal: "5.00", feeTotal: "0.10", purchaseAmount: "4.90" },
  conversion: {
    deposit: "4.0875",
    fil: "0.05",
    reserve: "0.5",
    input: "4.4",
    bridgeFee: "0.01515",
    filBudget: "0.3125",
  },
};

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-baseline justify-between gap-3'>
      <dt className='min-w-0 text-muted-foreground'>{label}</dt>
      <dd className='shrink-0 text-right font-medium tabular-nums'>{value}</dd>
    </div>
  );
}

export default function GuestCheckoutReceipt(props: ReceiptProps) {
  const example = props.mode === "example";
  const route = props.mode === "estimate" ? props.route : undefined;
  const quote = example ? walkthrough.quote : props.quote;
  const conversion = example
    ? walkthrough.conversion
    : route && {
        deposit: formatTokenTruncated(route.minimumDepositUsdfc, 18, "", 6),
        fil: formatUnits(route.minimumFil, 18),
        reserve: formatUnits(route.networkReserveUsdc, 6),
        input: formatUnits(route.sourceSpendUsdc, 6),
        bridgeFee: formatUnits(route.bridgeFeeUsdc, 6),
        filBudget: formatUnits(route.filSpendUsdfc, 18),
      };

  return (
    <div className='min-w-0 overflow-hidden rounded-2xl border bg-card'>
      {conversion && (
        <div className='relative isolate overflow-hidden bg-linear-to-br from-[#122a56] via-[#123c73] to-[#185689] text-white'>
          <div aria-hidden className='pointer-events-none absolute inset-0 -z-10 overflow-hidden'>
            <div className='absolute -right-20 -top-28 size-72 rounded-full border border-white/10 sm:-right-14' />
            <div className='absolute -right-12 -top-20 size-56 rounded-full border border-white/15 sm:-right-6' />
            <div className='absolute -right-4 -top-12 size-40 rounded-full border border-white/15 sm:right-2' />
            <div className='absolute top-7 right-3 -rotate-12 rounded-full border-2 border-[#ffcf68] bg-[#eaac00] p-px shadow-[2px_4px_0_#946407,4px_8px_14px_#091f4a70] sm:top-6 sm:right-10'>
              <USDFCLogo className='size-9 sm:size-[3.75rem]' />
            </div>
          </div>
          <div className='px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-4'>
            <span className='inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 text-[0.7rem] leading-none font-semibold tracking-wide text-blue-50 ring-1 ring-inset ring-white/25'>
              <ReceiptText aria-hidden className='size-3' />
              {example ? "Example receipt" : "Sandbox estimate"}
            </span>
            <dl className='mt-3'>
              <div className='pr-8 sm:pr-24'>
                <dt className='text-[0.82rem] leading-5 font-medium text-blue-100'>
                  {example ? "Illustrative Filecoin Pay deposit" : "Minimum Filecoin Pay deposit"}
                </dt>
                <dd className='mt-0.5 flex flex-wrap items-baseline gap-x-1.5 font-semibold tabular-nums'>
                  <span className='text-[2rem] leading-[1.15] tracking-tight sm:text-[2.6rem]'>
                    {conversion.deposit}
                  </span>{" "}
                  <span className='text-base text-blue-100'>USDFC</span>
                </dd>
              </div>
              <div className='mt-3 flex items-center justify-between gap-3 border-t border-white/20 pt-3 text-[0.82rem] sm:text-sm'>
                <dt className='flex items-center gap-2 text-blue-50'>
                  <span aria-hidden className='grid size-5 shrink-0 place-items-center rounded-full bg-white'>
                    <FilecoinLogo className='size-4' />
                  </span>
                  FIL for wallet network fees
                </dt>
                <dd className='shrink-0 font-semibold tabular-nums'>{conversion.fil} FIL</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
      <div className='p-4 sm:px-5'>
        <h3 className='text-sm font-semibold'>{example ? "Illustrative breakdown" : "Purchase breakdown"}</h3>
        <div className='mt-1 mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground'>
          <CreditCard aria-hidden className='size-3.5' />
          Apple Pay <ArrowRight aria-hidden className='size-3' />
          Base <ArrowRight aria-hidden className='size-3' />
          Filecoin
        </div>
        <dl className='grid gap-2 text-[0.82rem] sm:text-sm'>
          <div className='mb-0.5 flex items-baseline justify-between gap-3 border-t border-dashed pt-3 font-semibold'>
            <dt>Total charge</dt>
            <dd className='text-lg leading-6 tabular-nums'>${quote.paymentTotal}</dd>
          </div>
          <ReceiptRow label='Coinbase fees' value={`$${quote.feeTotal}`} />
          <ReceiptRow label='USDC delivered on Base' value={`${quote.purchaseAmount} USDC`} />
          {conversion && (
            <ReceiptRow label='Base gas and bridge fee budget' value={`Up to ${conversion.reserve} USDC`} />
          )}
        </dl>
        {conversion && (
          <details className='group mt-3 border-t pt-2 text-[0.82rem] sm:text-sm'>
            <summary className='flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden'>
              {example ? "Example conversion details" : "Conversion details"}
              <ChevronDown aria-hidden className='size-4 text-muted-foreground group-open:rotate-180' />
            </summary>
            <dl className='mt-2 grid gap-2'>
              <ReceiptRow label='Base USDC to convert' value={`${conversion.input} USDC`} />
              <ReceiptRow label='Bridge fee within the budget' value={`Up to ${conversion.bridgeFee} USDC`} />
              <ReceiptRow label='USDFC budget for FIL' value={`${conversion.filBudget} USDFC`} />
            </dl>
          </details>
        )}
      </div>
    </div>
  );
}
