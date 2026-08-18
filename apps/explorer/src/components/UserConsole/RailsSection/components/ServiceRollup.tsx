import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Rail } from "@filecoin-pay/types";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { CopyableText } from "@/components/shared";
import { knownAddresses } from "@/constants/known-addresses";
import { formatDate, formatRatePerMonth, formatToken } from "@/utils/formatter";

// A service = the operator of a rail. FWSS creates several rails per dataset
// (PDP + CDN + cache-miss), so the per-rail ledger is noise for payers; the
// billing-relevant unit is the per-service rollup below.

type OpKind = "create" | "addPieces" | "removals" | "terminate" | "other";

interface OpFeePayment {
  amount: bigint;
  createdAt: bigint;
  kind: OpKind;
}

const OP_KIND_LABELS: Record<OpKind, string> = {
  create: "Create data set",
  addPieces: "Add pieces",
  removals: "Piece removals",
  terminate: "Terminate",
  other: "Other",
};

// FWSS per-operation fees in 18-decimal USDFC (filecoin-services#469).
// Filecoin Pay one-time payment events don't name the operation that fired
// them, so the type is recovered by matching amounts against the published
// price list. Best-effort: a price change or a colliding amount lands in
// "other" / the wrong bucket rather than erroring.
const CREATE_FEE = 25n * 10n ** 15n; // 0.025
const TERMINATE_FEE = 112n * 10n ** 13n; // 0.00112
const REMOVALS_FEE = 2n * 10n ** 15n; // 0.002 per batch
const ADD_PIECES_BASE = 5n * 10n ** 14n; // 0.0005 per call
const ADD_PIECES_PER_PIECE = 3n * 10n ** 14n; // + 0.0003 x pieces

const classifyOpFee = (amount: bigint): OpKind => {
  if (amount === CREATE_FEE) return "create";
  if (amount === TERMINATE_FEE) return "terminate";
  // 0.002 is ambiguous: a removals batch, or a 5-piece add (0.0005 + 5x0.0003).
  // Removals are the flat, more common shape, so they win the collision.
  if (amount === REMOVALS_FEE) return "removals";
  if (amount > ADD_PIECES_BASE && (amount - ADD_PIECES_BASE) % ADD_PIECES_PER_PIECE === 0n) return "addPieces";
  // Combined create+add (the default SDK path) can fire as one payment.
  if (amount > CREATE_FEE && (amount - CREATE_FEE - ADD_PIECES_BASE) % ADD_PIECES_PER_PIECE === 0n) return "create";
  return "other";
};

interface ServiceGroup {
  address: string;
  name: string | null;
  rails: Rail[];
  /** Sum of streaming rates across the service's rails (per epoch). */
  recurringPerEpoch: bigint;
  /**
   * One-time payments on streaming rails. Operation fees (create data set,
   * add pieces, removals, terminate) are charged as one-time payments on the
   * rail that carries the streaming rate, so this bucket approximates
   * per-operation fees. Filecoin Pay does not record which operation fired a
   * one-time payment; naming the operation would require service-contract
   * events or price-list matching.
   */
  opFeesToDate: bigint;
  /** Individual operation-fee payment events, newest first. */
  opFeePayments: OpFeePayment[];
  /**
   * One-time payments on zero-rate rails. FWSS bills egress/cache-miss via
   * one-time payments on dedicated zero-rate rails, so this bucket
   * approximates usage-based spend.
   */
  usageToDate: bigint;
  /** Streaming amount settled to the payee so far. */
  settledToDate: bigint;
  /** Refundable reserve: fixed lockup + rate x lockup period, summed. */
  locked: bigint;
  earliestCreatedAt: bigint;
  settleableRails: Rail[];
  token: Rail["token"] | null;
}

interface ServiceRollupProps {
  rails: Rail[];
  onViewRails: (operatorAddress: string) => void;
  onSettleAll: (rails: Rail[]) => void;
  isSettling: (railId: string) => boolean;
}

const groupByService = (rails: Rail[]): ServiceGroup[] => {
  const groups = new Map<string, ServiceGroup>();
  for (const rail of rails) {
    const address = rail.operator.address.toLowerCase();
    let group = groups.get(address);
    if (!group) {
      group = {
        address,
        name: knownAddresses[address] ?? null,
        rails: [],
        recurringPerEpoch: 0n,
        opFeesToDate: 0n,
        opFeePayments: [],
        usageToDate: 0n,
        settledToDate: 0n,
        locked: 0n,
        earliestCreatedAt: rail.createdAt,
        settleableRails: [],
        token: rail.token ?? null,
      };
      groups.set(address, group);
    }
    group.rails.push(rail);
    const rate = BigInt(rail.paymentRate ?? 0);
    const oneTime = BigInt(rail.totalOneTimePaymentAmount ?? 0);
    group.recurringPerEpoch += rate;
    if (rate > 0n) {
      group.opFeesToDate += oneTime;
      for (const payment of rail.oneTimePayments ?? []) {
        const amount = BigInt(payment.totalAmount ?? 0);
        group.opFeePayments.push({
          amount,
          createdAt: payment.createdAt,
          kind: classifyOpFee(amount),
        });
      }
    } else {
      group.usageToDate += oneTime;
    }
    group.settledToDate += BigInt(rail.totalSettledAmount ?? 0);
    group.locked += BigInt(rail.lockupFixed ?? 0) + rate * BigInt(rail.lockupPeriod ?? 0);
    if (rail.createdAt < group.earliestCreatedAt) group.earliestCreatedAt = rail.createdAt;
    if (rail.state !== "FINALIZED" && rate > 0n) group.settleableRails.push(rail);
  }
  for (const group of groups.values()) {
    group.opFeePayments.sort((a, b) => Number(b.createdAt - a.createdAt));
  }
  return Array.from(groups.values());
};

const LineItem = ({ label, hint, value }: { label: string; hint?: string; value: string }) => (
  <div className='flex items-center justify-between gap-3 border-t border-border py-2 text-sm'>
    <span>
      {label}
      {hint && <span className='ml-1.5 text-xs text-muted-foreground'>{hint}</span>}
    </span>
    <span className='font-medium tabular-nums'>{value}</span>
  </div>
);

const ServiceCard = ({
  service,
  onViewRails,
  onSettleAll,
  isSettling,
}: {
  service: ServiceGroup;
  onViewRails: ServiceRollupProps["onViewRails"];
  onSettleAll: ServiceRollupProps["onSettleAll"];
  isSettling: ServiceRollupProps["isSettling"];
}) => {
  const [opFeesExpanded, setOpFeesExpanded] = useState(false);

  const decimals = service.token?.decimals ?? 18;
  const symbol = service.token?.symbol ?? "";
  const settling = service.settleableRails.some((rail) => isSettling(rail.railId.toString()));
  const settleCount = service.settleableRails.length;
  const OpFeeChevron = opFeesExpanded ? ChevronDown : ChevronRight;

  return (
    <div className='rounded-lg border border-border px-4 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-col gap-0.5'>
          <span className='font-medium'>{service.name ?? "Unknown service"}</span>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <CopyableText
              value={service.address}
              label='Service address'
              truncate={true}
              truncateLength={6}
              lookupName={false}
              className='text-xs text-muted-foreground font-normal'
            />
            <span>
              · {service.rails.length} {service.rails.length === 1 ? "rail" : "rails"} · since{" "}
              {formatDate(service.earliestCreatedAt)}
            </span>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='primary'
            size='compact'
            disabled={settleCount === 0 || settling}
            onClick={() => onSettleAll(service.settleableRails)}
          >
            {settling ? "Settling..." : settleCount === 0 ? "Nothing to settle" : `Settle all (${settleCount})`}
          </Button>
          <Button variant='ghost' size='compact' onClick={() => onViewRails(service.address)} icon={ArrowRight}>
            View rails
          </Button>
        </div>
      </div>
      <div className='mt-3'>
        {/* Line items ordered by settlement path: PDP-rail charges first
            (recurring subscription, then its one-time operation fees), then
            FilBeam-metered usage on the CDN rails, then account-level facts. */}
        <LineItem
          label='Recurring'
          hint='storage + onchain verification subscription'
          value={formatRatePerMonth(service.recurringPerEpoch, decimals, symbol)}
        />
        <button
          type='button'
          onClick={() => setOpFeesExpanded((prev) => !prev)}
          className='flex w-full items-center justify-between gap-3 border-t border-border py-2 text-left text-sm'
        >
          <span className='flex items-center gap-1'>
            <OpFeeChevron className='size-3.5 shrink-0 text-muted-foreground' />
            Per-operation fees to date
            <span className='ml-0.5 text-xs text-muted-foreground'>
              {service.opFeePayments.length} {service.opFeePayments.length === 1 ? "operation" : "operations"}
            </span>
          </span>
          <span className='font-medium tabular-nums'>{formatToken(service.opFeesToDate, decimals, symbol, 4)}</span>
        </button>
        {opFeesExpanded && (
          <div className='mb-1 ml-5 border-l-2 border-border pl-3'>
            {/* Per-type totals only. The dated per-payment history belongs to a
                future "export all transactions" view rather than living here. */}
            {service.opFeePayments.length === 0 ? (
              <div className='py-1.5 text-xs text-muted-foreground'>No operation fees charged yet.</div>
            ) : (
              <>
                {(Object.keys(OP_KIND_LABELS) as OpKind[]).map((kind) => {
                  const payments = service.opFeePayments.filter((payment) => payment.kind === kind);
                  if (payments.length === 0) return null;
                  const total = payments.reduce((sum, payment) => sum + payment.amount, 0n);
                  return (
                    <div key={kind} className='flex items-center justify-between gap-3 py-1.5 text-xs'>
                      <span>
                        {OP_KIND_LABELS[kind]} <span className='text-muted-foreground'>({payments.length})</span>
                      </span>
                      <span className='font-medium tabular-nums'>{formatToken(total, decimals, symbol, 6)}</span>
                    </div>
                  );
                })}
                {(() => {
                  // The query fetches recent payments per rail; anything past
                  // that window is in the onchain total but not itemized here.
                  const itemized = service.opFeePayments.reduce((sum, payment) => sum + payment.amount, 0n);
                  const remainder = service.opFeesToDate - itemized;
                  if (remainder <= 0n) return null;
                  return (
                    <div className='flex items-center justify-between gap-3 py-1.5 text-xs text-muted-foreground'>
                      <span>Older operations (not itemized)</span>
                      <span className='tabular-nums'>{formatToken(remainder, decimals, symbol, 6)}</span>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
        <LineItem
          label='Usage to date'
          hint='egress / cache-miss'
          value={formatToken(service.usageToDate, decimals, symbol, 4)}
        />
        <LineItem
          label='Locked for this service'
          hint='refundable'
          value={formatToken(service.locked, decimals, symbol, 4)}
        />
        <LineItem label='Paid to date' value={formatToken(service.settledToDate, decimals, symbol, 4)} />
      </div>
    </div>
  );
};

export const ServiceRollup: React.FC<ServiceRollupProps> = ({ rails, onViewRails, onSettleAll, isSettling }) => {
  const services = useMemo(() => groupByService(rails), [rails]);

  return (
    <div className='flex flex-col gap-3'>
      {services.map((service) => (
        <ServiceCard
          key={service.address}
          service={service}
          onViewRails={onViewRails}
          onSettleAll={onSettleAll}
          isSettling={isSettling}
        />
      ))}
    </div>
  );
};
