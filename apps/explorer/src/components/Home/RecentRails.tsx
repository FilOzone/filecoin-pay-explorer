import type { RailState } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@filecoin-pay/ui/components/empty";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import useRecentRails from "@/hooks/useRecentRails";
import { formatDate, formatToken } from "@/utils/formatter";
import { CopyableText } from "../shared";

const getStatusVariant = (state: RailState): "default" | "secondary" | "destructive" | "outline" => {
  switch (state) {
    case "ACTIVE":
      return "default";
    case "ZERORATE":
      return "secondary";
    case "TERMINATED":
      return "destructive";
    case "FINALIZED":
      return "outline";
    default:
      return "secondary";
  }
};

const RecentRails = () => {
  const { data, isLoading, isError, error, refetch } = useRecentRails(10);

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return <ErrorState refetch={refetch} error={error} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState />;
  }

  return (
    <section className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-xl font-semibold'>Recent Rails</h2>
        <Link to='/rails' className='text-sm text-primary hover:underline'>
          View All
        </Link>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rail ID</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Payment Rate</TableHead>
              <TableHead className='text-right'>Settled Amount</TableHead>
              <TableHead className='text-right'>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((rail) => (
              <TableRow key={rail.id}>
                <TableCell className='font-medium'>
                  <Link to={`/rail/${rail.railId}`} className='text-primary hover:underline'>
                    {rail.railId.toString()}
                  </Link>
                </TableCell>
                <TableCell className='font-mono text-sm'>
                  <CopyableText
                    value={rail.payer.address}
                    to={`/account/${rail.payer.address}`}
                    monospace={true}
                    label='Account'
                    truncate={true}
                    truncateLength={8}
                  />
                </TableCell>
                <TableCell className='font-mono text-sm'>
                  <CopyableText
                    value={rail.payee.address}
                    to={`/account/${rail.payee.address}`}
                    monospace={true}
                    label='Account'
                    truncate={true}
                    truncateLength={8}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(rail.state)}>{rail.state}</Badge>
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(rail.paymentRate, rail.token.decimals, rail.token.symbol, 8)}
                </TableCell>
                <TableCell className='text-right'>
                  {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 2)}
                </TableCell>
                <TableCell className='text-right text-muted-foreground'>{formatDate(rail.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
};

const LoadingState = () => (
  <section className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <Skeleton className='h-7 w-32' />
      <Skeleton className='h-5 w-16' />
    </div>
    <Card>
      <div className='p-4'>
        {[...Array(5)].map((_, i) => (
          <div key={i} className='flex items-center justify-between py-3 border-b last:border-0'>
            <Skeleton className='h-4 w-16' />
            <div className='flex gap-8'>
              <Skeleton className='h-4 w-20' />
              <Skeleton className='h-4 w-16' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-20' />
            </div>
          </div>
        ))}
      </div>
    </Card>
  </section>
);

const ErrorState: React.FC<{ refetch: () => void; error: Error }> = ({ refetch, error }) => (
  <section className='flex flex-col gap-4'>
    <h2 className='text-xl font-semibold'>Recent Rails</h2>
    <Card>
      <div className='py-12'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle>Failed to load rails</EmptyTitle>
            <EmptyDescription>{error?.message || "Something went wrong"}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={refetch}>Retry</Button>
          </EmptyContent>
        </Empty>
      </div>
    </Card>
  </section>
);

const EmptyState = () => (
  <section className='flex flex-col gap-4'>
    <h2 className='text-xl font-semibold'>Recent Rails</h2>
    <Card>
      <div className='py-12'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No rails found</EmptyTitle>
            <EmptyDescription>There are no rails to display at the moment.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Card>
  </section>
);

export default RecentRails;
