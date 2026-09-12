import { Card } from "@filecoin-pay/ui/components/card";
import { AlertCircle } from "lucide-react";
import { type CSSProperties, Fragment, memo, useMemo } from "react";
import { Bar, BarChart, type BarShapeProps, CartesianGrid, Rectangle, Tooltip, XAxis, YAxis } from "recharts";
import { knownAddresses } from "@/constants/known-addresses";
import { formatAddress } from "@/utils/formatter";
import { formatTokenAmount } from "../../FundsSection/utils/formatTokenAmount";
import type { SpendSeriesRow } from "../types";

/*
 * Every amount on this card rounds up, unlike the balances on the funds cards.
 * `formatTokenAmount` truncates by default because rounding a balance up
 * overstates what the holder can act on; here the figures are costs, and the
 * same rule points the other way.
 */

/**
 * A service's name where the app knows one, its truncated address otherwise.
 */
const operatorLabel = (address: string): string => knownAddresses[address] ?? formatAddress(address);

type SpendSeriesProps = {
  rows: SpendSeriesRow[];
  tokenDecimals: bigint | number;
  tokenSymbol: string;
};

type SpendBarChartProps = SpendSeriesProps & {
  /** A capped collection came back full, so the months shown may be incomplete. */
  hasReachedHistoryLimit: boolean;
};

/** The bigint fields drive every displayed amount; the two numbers only size bars. */
type SpendChartDatum = SpendSeriesRow & {
  streamingHeight: number;
  oneTimeHeight: number;
};

const AXIS_TICK_FORMAT = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/**
 * The two stacked series: hatch id for the unfinished month, and the class that
 * paints the solid one.
 *
 * Pattern ids are module constants because only one spend chart is ever mounted
 * at a time. A second instance on the same page would collide and both would
 * take whichever `<defs>` rendered last; give them a `useId` suffix if that day
 * comes.
 *
 * Colours are applied as classes, never as a `fill="var(--…)"` attribute.
 */
const SERIES = {
  streaming: { patternId: "spend-hatch-streaming", fillClass: "fill-spend-streaming" },
  oneTime: { patternId: "spend-hatch-one-time", fillClass: "fill-spend-one-time" },
} as const;

const HatchPattern = ({ id, stripeClass }: { id: string; stripeClass: string }) => (
  <pattern id={id} width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
    <rect width='8' height='8' className='fill-spend-partial-base' />
    <rect width='2' height='8' className={stripeClass} />
  </pattern>
);

/**
 * One `shape` per series: the hatch must take the series' colour, and a bar shape
 * cannot ask which series it belongs to. Built once, so bars never remount.
 *
 * The colour is closed over rather than read from `props.fill`, so it does not
 * depend on recharts forwarding `fill` into the shape.
 */
const makeSpendBarShape = ({ patternId, fillClass }: (typeof SERIES)[keyof typeof SERIES]) => {
  const SpendBarShape = (props: BarShapeProps) => {
    const datum = props.payload as SpendChartDatum | undefined;

    // A partial month takes the hatch, which is a paint server referenced by id
    // — a plain attribute with no token in it, so it needs no class.
    if (datum?.isPartial) return <Rectangle {...props} fill={`url(#${patternId})`} />;
    return <Rectangle {...props} className={`${props.className ?? ""} ${fillClass}`} />;
  };
  return SpendBarShape;
};

const StreamingBarShape = makeSpendBarShape(SERIES.streaming);
const OneTimeBarShape = makeSpendBarShape(SERIES.oneTime);

const toChartUnits = (amount: bigint, tokenDecimals: bigint | number): number =>
  Number(amount) / 10 ** Number(tokenDecimals);

type SpendTooltipProps = {
  datum: SpendChartDatum;
  tokenDecimals: bigint | number;
  tokenSymbol: string;
};

/** Opacity only: the tooltip lands in place rather than travelling into it; the fade softens the snap. */
const TOOLTIP_ENTER_CLASSNAME = "animate-in fade-in duration-300 ease-out";

const SpendTooltip = ({ datum, tokenDecimals, tokenSymbol }: SpendTooltipProps) => (
  <Card role='status' className={`gap-2 rounded-lg border-border p-3 text-sm shadow-md ${TOOLTIP_ENTER_CLASSNAME}`}>
    <p className='font-medium text-foreground'>
      {datum.fullLabel}
      {datum.isPartial ? " (to date)" : ""}
    </p>
    <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
      <dt className='text-muted-foreground'>Streaming (max)</dt>
      <dd className='text-right text-foreground'>{formatTokenAmount(datum.streaming, tokenDecimals, "up")}</dd>
      <dt className='text-muted-foreground'>One-time</dt>
      <dd className='text-right text-foreground'>{formatTokenAmount(datum.oneTime, tokenDecimals, "up")}</dd>
      <dt className='font-medium text-foreground'>Up to</dt>
      <dd className='text-right font-medium text-foreground'>
        {formatTokenAmount(datum.total, tokenDecimals, "up")} {tokenSymbol}
      </dd>
    </dl>
    {/*
      Which services the month went to. Separated by a rule rather than added as
      more rows, because these split the same total a second way rather than
      adding to it — the amounts above and below each sum to "Up to".
    */}
    {datum.byOperator.length > 0 ? (
      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2'>
        {datum.byOperator.map((operator) => (
          <Fragment key={operator.address}>
            <dt className='truncate text-muted-foreground'>{operatorLabel(operator.address)}</dt>
            <dd className='text-right text-foreground'>{formatTokenAmount(operator.amount, tokenDecimals, "up")}</dd>
          </Fragment>
        ))}
      </dl>
    ) : null}
  </Card>
);

/** The hatch in CSS at a finer pitch: the bars' 8px tile would barely fit one stripe in a 12px swatch. */
const PARTIAL_SWATCH_STYLE: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(45deg, var(--spend-streaming) 0 1px, var(--spend-partial-base) 1px 4px)",
};

type LegendSwatchProps = {
  children: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * Screen-reader equivalent of the chart: the whole series at once, no pointer or
 * colour needed.
 *
 * The per-service split is a sentence in one cell rather than a column per
 * service
 */
const SpendDataTable = ({ rows, tokenDecimals, tokenSymbol }: SpendSeriesProps) => (
  <table className='sr-only'>
    <caption>Maximum {tokenSymbol} scheduled per month, oldest first.</caption>
    <thead>
      <tr>
        <th scope='col'>Month</th>
        <th scope='col'>Streaming (max)</th>
        <th scope='col'>One-time</th>
        <th scope='col'>Up to</th>
        <th scope='col'>By service</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.fullLabel}>
          <th scope='row'>
            {row.fullLabel}
            {row.isPartial ? " (to date)" : ""}
          </th>
          <td>{formatTokenAmount(row.streaming, tokenDecimals, "up")}</td>
          <td>{formatTokenAmount(row.oneTime, tokenDecimals, "up")}</td>
          <td>{formatTokenAmount(row.total, tokenDecimals, "up")}</td>
          <td>
            {row.byOperator.length > 0
              ? row.byOperator
                  .map((entry) => {
                    const amount = formatTokenAmount(entry.amount, tokenDecimals, "up");
                    return `${operatorLabel(entry.address)} ${amount}`;
                  })
                  .join(", ")
              : "None"}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const LegendSwatch = ({ children, className, style }: LegendSwatchProps) => (
  <span className='flex items-center gap-2 text-sm text-muted-foreground'>
    <span aria-hidden='true' className={`size-3 shrink-0 rounded-xs ${className ?? ""}`} style={style} />
    {children}
  </span>
);

const SpendBarChart = ({ rows, tokenDecimals, tokenSymbol, hasReachedHistoryLimit }: SpendBarChartProps) => {
  const data = useMemo<SpendChartDatum[]>(
    () =>
      rows.map((row) => ({
        ...row,
        streamingHeight: toChartUnits(row.streaming, tokenDecimals),
        oneTimeHeight: toChartUnits(row.oneTime, tokenDecimals),
      })),
    [rows, tokenDecimals],
  );

  const hasPartialMonth = data.some((datum) => datum.isPartial);

  return (
    <Card className='gap-4 p-4'>
      <SpendDataTable rows={rows} tokenDecimals={tokenDecimals} tokenSymbol={tokenSymbol} />
      <figure
        aria-label={`Maximum ${tokenSymbol} scheduled per month for the last ${data.length} months`}
        className='h-64 w-full'
      >
        <BarChart
          responsive
          width='100%'
          height='100%'
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          desc={`Maximum ${tokenSymbol} scheduled per month, stacked. Same figures as the adjacent table.`}
        >
          <defs>
            <HatchPattern id={SERIES.streaming.patternId} stripeClass={SERIES.streaming.fillClass} />
            <HatchPattern id={SERIES.oneTime.patternId} stripeClass={SERIES.oneTime.fillClass} />
          </defs>
          <CartesianGrid stroke='var(--border)' strokeDasharray='3 3' vertical={false} />
          <XAxis
            dataKey='label'
            stroke='var(--muted-foreground)'
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            stroke='var(--muted-foreground)'
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => AXIS_TICK_FORMAT.format(value)}
          />
          {/* `y` pinned so the readout stays put instead of jumping to each bar's cap. */}
          <Tooltip
            isAnimationActive={false}
            position={{ y: 0 }}
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            content={({ active, payload }) => {
              const datum = payload?.[0]?.payload as SpendChartDatum | undefined;
              if (!active || !datum) return null;
              return <SpendTooltip datum={datum} tokenDecimals={tokenDecimals} tokenSymbol={tokenSymbol} />;
            }}
          />
          {/* One `stackId` puts both series in a single bar per month. */}
          <Bar dataKey='streamingHeight' stackId='cost' name='Streaming (max)' shape={StreamingBarShape} />
          <Bar dataKey='oneTimeHeight' stackId='cost' name='One-time' shape={OneTimeBarShape} />
        </BarChart>
      </figure>

      <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
        <LegendSwatch className='bg-spend-streaming'>Streaming (max)</LegendSwatch>
        <LegendSwatch className='bg-spend-one-time'>One-time</LegendSwatch>
        {hasPartialMonth ? <LegendSwatch style={PARTIAL_SWATCH_STYLE}>Current month, to date</LegendSwatch> : null}
      </div>

      {hasReachedHistoryLimit ? (
        <p className='flex items-start gap-2 text-sm text-foreground'>
          <AlertCircle aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
          <span>This account reached the history limit, so monthly values may be incomplete.</span>
        </p>
      ) : null}

      <p className='text-sm text-muted-foreground'>
        Streaming payments show the maximum possible charge based on the agreed rate. Actual payments may be lower if
        the service isn't fully delivered or verified. One-time payments show the actual amount paid.
      </p>
    </Card>
  );
};

// `rows` is memoised upstream and the other props are primitives, so this skips
// recharts reconciliation on the once-per-epoch tick.
export default memo(SpendBarChart);
