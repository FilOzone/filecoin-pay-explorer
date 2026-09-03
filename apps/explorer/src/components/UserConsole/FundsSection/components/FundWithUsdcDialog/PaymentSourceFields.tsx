import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Label } from "@filecoin-pay/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import type { SourceToken } from "@filecoin-project/squid-evm-funding";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import {
  formatUsdcBalance,
  fundedUsdcSourceOptions,
  isSameUsdcSource,
  parseUsdcSourceValue,
  toUsdcSourceValue,
  type UsdcSource,
  type UsdcSourceChoice,
} from "../../data/usdc-sources";
import type { SourceChain } from "./useSquidDepositExecution";
import { describeWallet } from "./wallets";

/** Which wallet pays, and with which of the USDC it holds. */
export function PaymentSourceFields({
  areWalletsReady,
  isBusy,
  isCollapsed,
  isScanning,
  onConnectAnother,
  onExpand,
  onPayingAddressChange,
  onSourceChange,
  payingWallet,
  sourceChain,
  sourceChoice,
  sources,
  sourceToken,
  tokensQuery,
  wallets,
}: {
  areWalletsReady: boolean;
  isBusy: boolean;
  /** One summary line with a Change action, until the user wants to pick differently. */
  isCollapsed: boolean;
  /** True while some network has not reported its balances yet. */
  isScanning: boolean;
  onConnectAnother: () => void;
  onExpand: () => void;
  onPayingAddressChange: (address: string) => void;
  onSourceChange: (choice: UsdcSourceChoice) => void;
  payingWallet: ConnectedWallet | undefined;
  sourceChain: SourceChain | undefined;
  sourceChoice: UsdcSourceChoice;
  /** The paying wallet's USDC on every network, largest first. */
  sources: readonly UsdcSource[];
  sourceToken: SourceToken | undefined;
  tokensQuery: { isError: boolean };
  wallets: ConnectedWallet[];
}) {
  const funded = fundedUsdcSourceOptions({ chains: SQUID_SOURCE_CHAINS, sources });
  const selectedSource = sources.find((source) => isSameUsdcSource(source, sourceChoice));
  const isSelectedFunded = !!selectedSource && selectedSource.balance > 0n;
  const emptyNote = isScanning ? "Checking balances…" : "No USDC found on any supported network.";

  if (isCollapsed && payingWallet) {
    return (
      <div className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-3'>
        <span>
          <span className='text-muted-foreground'>From </span>
          {describeWallet(payingWallet)}
          {isSelectedFunded && selectedSource && sourceToken ? (
            <>
              <span className='text-muted-foreground'> on </span>
              {sourceChain?.name ?? "this network"}
              <span className='text-muted-foreground'>
                {" "}
                · {formatUsdcBalance(selectedSource)} {sourceToken.symbol}
              </span>
            </>
          ) : (
            <span className='text-muted-foreground'> · {funded.length > 0 ? "choose a network" : emptyNote}</span>
          )}
        </span>
        <Button
          aria-label='Change payment source'
          disabled={isBusy}
          onClick={onExpand}
          size='compact'
          type='button'
          variant='ghost'
        >
          Change
        </Button>
      </div>
    );
  }
  return (
    <>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='grid gap-2'>
          {/* Both label rows take the height of the button in this one, so the labels line up. */}
          <div className='flex min-h-10 items-center justify-between gap-2'>
            <Label htmlFor='fund-with-usdc-wallet'>Pay from</Label>
            <Button
              aria-label='Connect another wallet'
              disabled={isBusy}
              onClick={onConnectAnother}
              size='compact'
              type='button'
              variant='ghost'
            >
              Connect another
            </Button>
          </div>
          <Select
            disabled={isBusy || !areWalletsReady || wallets.length === 0}
            onValueChange={onPayingAddressChange}
            value={payingWallet?.address ?? ""}
          >
            <SelectTrigger aria-label='Paying wallet' className='w-full' id='fund-with-usdc-wallet'>
              <SelectValue placeholder={areWalletsReady ? "Choose a wallet" : "Loading wallets…"} />
            </SelectTrigger>
            <SelectContent>
              {wallets.map((wallet) => (
                <SelectItem key={wallet.address} value={wallet.address}>
                  {describeWallet(wallet)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='grid gap-2'>
          <div className='flex min-h-10 items-center justify-between gap-2'>
            <Label htmlFor='fund-with-usdc-source'>Pay with</Label>
            {isScanning && funded.length > 0 ? (
              <span className='text-xs text-muted-foreground'>Checking balances…</span>
            ) : null}
          </div>
          {funded.length > 0 ? (
            <Select
              disabled={isBusy}
              onValueChange={(value) => onSourceChange(parseUsdcSourceValue(value))}
              value={isSelectedFunded ? toUsdcSourceValue(sourceChoice) : ""}
            >
              <SelectTrigger aria-label='Payment source' className='w-full' id='fund-with-usdc-source'>
                <SelectValue placeholder='Choose a network' />
              </SelectTrigger>
              <SelectContent>
                {funded.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className='flex h-9 items-center text-muted-foreground' id='fund-with-usdc-source'>
              {emptyNote}
            </p>
          )}
        </div>
      </div>
      {tokensQuery.isError && (
        <p className='text-destructive' role='alert'>
          Could not load Squid's token list. Try again shortly.
        </p>
      )}
    </>
  );
}
