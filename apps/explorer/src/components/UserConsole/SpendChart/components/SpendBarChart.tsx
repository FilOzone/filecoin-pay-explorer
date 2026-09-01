import { Card } from "@filecoin-pay/ui/components/card";
import { AlertCircle } from "lucide-react";
import { type CSSProperties, memo, useMemo } from "react";
import { Bar, BarChart, type BarShapeProps, CartesianGrid, Rectangle, Tooltip, XAxis, YAxis } from "recharts";
import { formatTokenAmount } from "../../FundsSection/utils/formatTokenAmount";
import type { SpendSeriesRow } from "../types";

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
 * Hatch tiles marking a month that has not finished yet.
 *
 * Ids are module constants because only one spend chart is ever mounted at a
 * time. A second instance on the same page would collide and both would take
 * whichever `<defs>` rendered last; give them a `useId` suffix if that day comes.
 */
const HATCH_PATTERN_ID = {
  streaming: "spend-hatch-streaming",
  oneTime: "spend-hatch-one-time",
} as const;

/**
 * Diagonal stripes of the series colour over the recessive partial ground.
 *
 * Two rects, not a stroked line: a stroke centres on the tile edge and seams.
 */
const HatchPattern = ({ id, stripe }: { id: string; stripe: string }) => (
  <pattern id={id} width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
    <rect width='8' height='8' fill='var(--spend-partial-base)' />
    <rect width='2' height='8' fill={stripe} />
  </pattern>
);

/**
 * One `shape` per series: the hatch must take the series' colour, and a bar shape
 * cannot ask which series it belongs to. Built once, so bars never remount.
 */
const makeSpendBarShape = (patternId: string) => {
  const SpendBarShape = (props: BarShapeProps) => {
    const datum = props.payload as SpendChartDatum | undefined;
    if (!datum?.isPartial) return <Rectangle {...props} />;
    return <Rectangle {...props} fill={`url(#${patternId})`} />;
  };
  return SpendBarShape;
};

const StreamingBarShape = makeSpendBarShape(HATCH_PATTERN_ID.streaming);
const OneTimeBarShape = makeSpendBarShape(HATCH_PATTERN_ID.oneTime);

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
  // `role='status'` because recharts' accessibility layer is on by default, so
  // arrow keys move between bars and swap this content. Recharts announces its
  // own tooltip, but custom content is just a div — without a live region the
  // values change silently for anyone navigating by keyboard.
  <Card role='status' className={`gap-2 rounded-lg border-border p-3 text-sm shadow-md ${TOOLTIP_ENTER_CLASSNAME}`}>
    <p className='font-medium text-foreground'>
      {datum.fullLabel}
      {datum.isPartial ? " (to date)" : ""}
    </p>
    <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
      <dt className='text-muted-foreground'>Streaming (max)</dt>
      <dd className='text-right text-foreground'>{formatTokenAmount(datum.streaming, tokenDecimals)}</dd>
      <dt className='text-muted-foreground'>One-time</dt>
      <dd className='text-right text-foreground'>{formatTokenAmount(datum.oneTime, tokenDecimals)}</dd>
      <dt className='font-medium text-foreground'>Up to</dt>
      <dd className='text-right font-medium text-foreground'>
        {formatTokenAmount(datum.total, tokenDecimals)} {tokenSymbol}
      </dd>
    </dl>
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

/** Screen-reader equivalent of the chart: the whole series at once, no pointer or colour needed. */
const SpendDataTable = ({ rows, tokenDecimals, tokenSymbol }: SpendSeriesProps) => (
  <table className='sr-only'>
    <caption>Maximum {tokenSymbol} scheduled per month, oldest first.</caption>
    <thead>
      <tr>
        <th scope='col'>Month</th>
        <th scope='col'>Streaming (max)</th>
        <th scope='col'>One-time</th>
        <th scope='col'>Up to</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.fullLabel}>
          <th scope='row'>
            {row.fullLabel}
            {row.isPartial ? " (to date)" : ""}
          </th>
          <td>{formatTokenAmount(row.streaming, tokenDecimals)}</td>
          <td>{formatTokenAmount(row.oneTime, tokenDecimals)}</td>
          <td>{formatTokenAmount(row.total, tokenDecimals)}</td>
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

      {/*
        Visible to assistive tech rather than hidden behind the table: recharts'
        accessibility layer holds a focusable element, and hiding it would leave
        that reachable by keyboard but invisible to a screen reader.
      */}
      <figure
        aria-label={`Maximum ${tokenSymbol} scheduled per month for the last ${data.length} months`}
        className='h-64 w-full'
      >
        {/*
          `responsive`, not `ResponsiveContainer`: that wrapper starts at its
          documented -1 x -1 `initialDimension`, so its first pass warns.
        */}
        <BarChart
          responsive
          width='100%'
          height='100%'
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          // `desc` is the only accessible-text prop recharts accepts here —
          // `CartesianChartProps` does not extend SVG attributes, so `role` and
          // `aria-label` would not type-check. The accessible name lives on the
          // wrapper instead.
          desc={`Maximum ${tokenSymbol} scheduled per month, stacked. Same figures as the adjacent table.`}
        >
          <defs>
            <HatchPattern id={HATCH_PATTERN_ID.streaming} stripe='var(--spend-streaming)' />
            <HatchPattern id={HATCH_PATTERN_ID.oneTime} stripe='var(--spend-one-time)' />
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
          <Bar
            dataKey='streamingHeight'
            stackId='cost'
            fill='var(--spend-streaming)'
            name='Streaming (max)'
            shape={StreamingBarShape}
          />
          <Bar
            dataKey='oneTimeHeight'
            stackId='cost'
            fill='var(--spend-one-time)'
            name='One-time'
            shape={OneTimeBarShape}
          />
        </BarChart>
      </figure>

      <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
        <LegendSwatch className='bg-spend-streaming'>Streaming (max)</LegendSwatch>
        <LegendSwatch className='bg-spend-one-time'>One-time</LegendSwatch>
        {hasPartialMonth ? <LegendSwatch style={PARTIAL_SWATCH_STYLE}>Current month, to date</LegendSwatch> : null}
      </div>

      {/* Completeness, not semantics — kept off the muted tone so it is not read as more small print. */}
      {hasReachedHistoryLimit ? (
        <p className='flex items-start gap-2 text-sm text-foreground'>
          <AlertCircle aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
          <span>This account reached the history limit, so monthly values may be incomplete.</span>
        </p>
      ) : null}

      <p className='text-sm text-muted-foreground'>
        Streaming bars are an estimate: the most a rail can charge at its agreed rate, reconstructed from the rate
        changes the subgraph records. Validated services, such as storage that must prove itself, settle for less when
        proving is incomplete — sometimes for nothing. One-time payments are actual amounts.
      </p>
    </Card>
  );
};

// `rows` is memoised upstream and the other props are primitives, so this skips
// recharts reconciliation on the once-per-epoch tick.
export default memo(SpendBarChart);
