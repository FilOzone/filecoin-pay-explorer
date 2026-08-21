import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import type { UserToken } from "@filecoin-pay/types";
import { Label } from "@filecoin-pay/ui/components/label";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { AlertCircle, ChevronDown, ChevronLeft, Loader2, Plus } from "lucide-react";
import { useId } from "react";
import TokenIcon from "@/components/shared/TokenIcon";
import { formatAddress } from "@/utils/formatter";

/**
 * Which face of the picker is showing. Owned by the dialog rather than the
 * picker so that closing the dialog resets it along with the rest of the form.
 */
export type TokenPickerMode = "collapsed" | "list" | "custom";

/** How far a hand-entered contract address got towards resolving to a token. */
export type CustomTokenStatus = "idle" | "invalid" | "loading" | "error" | "loaded";

/** Everything the picker needs to describe a token, from either source. */
export type PickerToken = {
  address: string;
  symbol: string;
  decimals: number;
  /**
   * Present for a token resolved from chain reads, absent for one taken from the
   * account list — those carry a subgraph-supplied name that must not be reused
   * for permit signing, so the picker does not carry it at all.
   */
  name?: string;
};

type DepositTokenPickerProps = {
  /** Tokens already held by the account, supplied by the caller — never re-queried here. */
  tokens: UserToken[];
  /** The token the deposit will act on, from the list or from a resolved custom address. */
  token: PickerToken | null;
  mode: TokenPickerMode;
  onModeChange: (mode: TokenPickerMode) => void;
  onSelectToken: (userToken: UserToken) => void;
  customAddress: string;
  onCustomAddressChange: (value: string) => void;
  customTokenStatus: CustomTokenStatus;
  /** The connected network, named in the custom-address hint. */
  chainName: string;
  disabled?: boolean;
};

const rowClasses =
  "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50";

const toPickerToken = (userToken: UserToken): PickerToken => ({
  address: userToken.token.id,
  symbol: userToken.token.symbol,
  decimals: Number(userToken.token.decimals),
});

/**
 * Icon, symbol and truncated address — the one token presentation used everywhere here.
 *
 * `showName` is off by default because the name only earns its width where the
 * token is unfamiliar: the rows list tokens the account already holds, so there
 * the symbol identifies them and a second string per row costs scanability.
 *
 * The name never replaces the address. It is self-reported by the contract — any
 * token can claim to be "USD Coin" — so it helps recognition without being what
 * pins identity.
 *
 * Symbol and name both truncate: on the custom-address path they are whatever a
 * hand-entered contract returns, so neither has a length this layout can assume.
 */
const TokenSummary = ({ token, showName = false }: { token: PickerToken; showName?: boolean }) => (
  <span className='flex min-w-0 items-center gap-3'>
    <TokenIcon token={token} className='size-7 shrink-0' />
    <span className='flex min-w-0 flex-col'>
      <span className='flex min-w-0 items-baseline gap-2'>
        <span className='min-w-0 truncate font-medium text-foreground'>{token.symbol}</span>
        {showName && token.name ? (
          <span className='min-w-0 truncate text-xs text-muted-foreground'>{token.name}</span>
        ) : null}
      </span>
      <span className='truncate font-mono text-[0.6875rem] text-muted-foreground'>{formatAddress(token.address)}</span>
    </span>
  </span>
);

/** Trails every token row, so on the collapsed trigger it sits beside the chevron. */
const TokenDecimals = ({ decimals }: { decimals: number }) => (
  <span className='shrink-0 text-xs text-muted-foreground'>{decimals} decimals</span>
);

/**
 * Condensed replacement for the old verbose "token loaded" panel: the failure
 * modes still get their own message, success is just the token row itself.
 */
const CustomTokenStatusMessage = ({
  status,
  token,
  chainName,
}: {
  status: CustomTokenStatus;
  token: PickerToken | null;
  chainName: string;
}) => {
  // An empty field otherwise offers only a "0x..." placeholder. Naming the
  // network matters most here: an address from another chain is the likeliest
  // mistake, and it surfaces only as the generic error below.
  if (status === "idle") {
    return <p className='text-sm text-muted-foreground'>Paste an ERC-20 contract address on {chainName}.</p>;
  }

  if (status === "invalid") {
    return (
      <p className='flex items-center gap-2 text-sm text-destructive'>
        <AlertCircle className='size-4 shrink-0' aria-hidden='true' />
        Not a valid contract address
      </p>
    );
  }

  if (status === "loading") {
    return (
      <p className='flex items-center gap-2 text-sm text-muted-foreground'>
        <Loader2 className='size-4 shrink-0 animate-spin' aria-hidden='true' />
        Loading token details…
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className='flex items-center gap-2 text-sm text-destructive'>
        <AlertCircle className='size-4 shrink-0' aria-hidden='true' />
        Couldn't read this token. Check it is an ERC-20 contract on the connected network.
      </p>
    );
  }

  if (status === "loaded" && token) {
    return (
      // The one surface that shows the name: the address here was typed by hand,
      // so this is where the user needs to recognise what it resolved to.
      <div className='flex items-center justify-between gap-3 rounded-lg border bg-background p-3'>
        <TokenSummary token={token} showName />
        <TokenDecimals decimals={token.decimals} />
      </div>
    );
  }

  return null;
};

/**
 * Single entry point for choosing what to deposit: the account's own tokens, or
 * a contract address typed in by hand.
 */
const DepositTokenPicker = ({
  tokens,
  token,
  mode,
  onModeChange,
  onSelectToken,
  customAddress,
  onCustomAddressChange,
  customTokenStatus,
  chainName,
  disabled = false,
}: DepositTokenPickerProps) => {
  const listId = useId();
  const addressInputId = useId();
  const addressStatusId = useId();

  // The selected token is already shown on the collapsed trigger, so listing it
  // again would just be a row that does nothing when clicked.
  const selectableTokens = tokens.filter(
    (userToken) => userToken.token.id.toLowerCase() !== token?.address.toLowerCase(),
  );

  if (mode === "custom") {
    return (
      <div className='grid gap-2'>
        <div className='flex items-center justify-between'>
          <Label htmlFor={addressInputId}>Token contract address</Label>
          <button
            type='button'
            onClick={() => onModeChange("list")}
            disabled={disabled}
            className='flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
          >
            <ChevronLeft className='size-3' aria-hidden='true' />
            Back
          </button>
        </div>
        <Input
          id={addressInputId}
          placeholder='0x...'
          value={customAddress}
          onChange={onCustomAddressChange}
          disabled={disabled}
          className='font-mono text-sm'
          aria-invalid={customTokenStatus === "invalid" || customTokenStatus === "error"}
          aria-describedby={addressStatusId}
        />
        <div id={addressStatusId} aria-live='polite'>
          <CustomTokenStatusMessage status={customTokenStatus} token={token} chainName={chainName} />
        </div>
      </div>
    );
  }

  return (
    <div className='grid gap-2'>
      <span className='text-sm font-medium text-foreground'>Token</span>

      {/* Trigger and expanded panel share one bordered box, so the list reads as
          a continuation of the selected row rather than a detached card. */}
      <div className='divide-y overflow-hidden rounded-lg border bg-background'>
        {token ? (
          <button
            type='button'
            onClick={() => onModeChange(mode === "list" ? "collapsed" : "list")}
            disabled={disabled}
            aria-expanded={mode === "list"}
            aria-controls={listId}
            aria-label={`Selected token ${token.symbol}. Change token`}
            className={cn(rowClasses, "justify-between")}
          >
            <TokenSummary token={token} />
            <span className='flex shrink-0 items-center gap-2'>
              <TokenDecimals decimals={token.decimals} />
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  mode === "list" && "rotate-180",
                )}
                aria-hidden='true'
              />
            </span>
          </button>
        ) : null}

        {mode === "list" ? (
          <div id={listId} className='divide-y'>
            {/* Only the token rows scroll: the account can hold far more than fit
                on screen, and bounding them here keeps the "Add supported token"
                row below pinned in view instead of buried at the end. */}
            {selectableTokens.length > 0 ? (
              <ul aria-label='Other tokens in your account' className='max-h-64 divide-y overflow-y-auto'>
                {selectableTokens.map((userToken) => {
                  const listToken = toPickerToken(userToken);

                  return (
                    <li key={userToken.id}>
                      <button
                        type='button'
                        onClick={() => onSelectToken(userToken)}
                        disabled={disabled}
                        className={cn(rowClasses, "justify-between")}
                      >
                        <TokenSummary token={listToken} />
                        <TokenDecimals decimals={listToken.decimals} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {tokens.length === 0 ? <p className='p-3 text-sm text-muted-foreground'>No tokens deposited yet.</p> : null}

            {/*
             * TODO: list the tokens supported by Filecoin Pay from the subgraph's
             * `Token` entity so most users pick from a known set, and keep raw
             * address entry only as the fallback for tokens not yet indexed.
             */}
            <button
              type='button'
              onClick={() => onModeChange("custom")}
              disabled={disabled}
              className={cn(rowClasses, "text-muted-foreground hover:text-foreground")}
            >
              <span className='flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-current'>
                <Plus className='size-3.5' aria-hidden='true' />
              </span>
              <span className='flex min-w-0 flex-col'>
                <span className='text-sm font-medium'>Add supported token</span>
                <span className='truncate text-[0.6875rem] text-muted-foreground'>Use a different token address</span>
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DepositTokenPicker;
