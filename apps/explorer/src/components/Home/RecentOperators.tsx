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
import useRecentOperators from "@/hooks/useRecentOperators";
import { formatCompactNumber } from "@/utils/formatter";
import { CopyableText, StyledLink } from "../shared";

const RecentOperators = () => {
  const { data, isLoading, isError, error, refetch } = useRecentOperators(10);

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
        <h2 className='text-xl font-semibold'>Recent Operators</h2>
        <StyledLink to='/operators' className='text-sm'>
          View All
        </StyledLink>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead className='text-right'>Total Rails</TableHead>
              <TableHead className='text-right'>Total Tokens</TableHead>
              <TableHead className='text-right'>Total Approvals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((operator) => (
              <TableRow key={operator.id}>
                <TableCell className='font-mono text-sm'>
                  <CopyableText
                    value={operator.address}
                    to={`/operator/${operator.address}`}
                    monospace={true}
                    label='Account'
                    truncate={true}
                    truncateLength={8}
                  />
                </TableCell>
                <TableCell className='text-right'>{formatCompactNumber(operator.totalRails)}</TableCell>
                <TableCell className='text-right'>{formatCompactNumber(operator.totalTokens)}</TableCell>
                <TableCell className='text-right'>{formatCompactNumber(operator.totalApprovals)}</TableCell>
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
      <Skeleton className='h-7 w-40' />
      <Skeleton className='h-5 w-16' />
    </div>
    <Card>
      <div className='p-4'>
        {[...Array(5)].map((_, i) => (
          <div key={i} className='flex items-center justify-between py-3 border-b last:border-0'>
            <Skeleton className='h-4 w-32' />
            <div className='flex gap-8'>
              <Skeleton className='h-4 w-12' />
              <Skeleton className='h-4 w-12' />
              <Skeleton className='h-4 w-12' />
            </div>
          </div>
        ))}
      </div>
    </Card>
  </section>
);

const ErrorState: React.FC<{ refetch: () => void; error: Error }> = ({ refetch, error }) => (
  <section className='flex flex-col gap-4'>
    <h2 className='text-xl font-semibold'>Recent Operators</h2>
    <Card>
      <div className='py-12'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle>Failed to load operators</EmptyTitle>
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
    <h2 className='text-xl font-semibold'>Recent Operators</h2>
    <Card>
      <div className='py-12'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No operators found</EmptyTitle>
            <EmptyDescription>There are no operators to display at the moment.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Card>
  </section>
);

export default RecentOperators;
