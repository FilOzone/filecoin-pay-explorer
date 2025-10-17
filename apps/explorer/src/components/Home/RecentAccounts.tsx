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
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { AlertCircle, Info } from "lucide-react";
import useRecentAccounts from "@/hooks/useRecentAccounts";
import { formatCompactNumber } from "@/utils/formatter";
import { CopyableText, StyledLink } from "../shared";

const RecentAccounts = () => {
  const { data, isLoading, isError, error, refetch } = useRecentAccounts(10);

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
        <h2 className='text-xl font-semibold'>Recent Accounts</h2>
        <StyledLink to='/accounts' className='text-sm'>
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
              <TableHead className='text-right'>
                <div className='flex items-center justify-end gap-1.5'>
                  Total Approvals
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className='h-3.5 w-3.5 text-muted-foreground cursor-help' />
                    </TooltipTrigger>
                    <TooltipContent side='top' className='max-w-xs'>
                      How many payment managers this account has given permission to use their tokens
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((account) => (
              <TableRow key={account.id}>
                <TableCell className='font-mono text-sm'>
                  <CopyableText
                    value={account.address}
                    to={`/account/${account.address}`}
                    monospace={true}
                    label='Account'
                    truncate={true}
                    truncateLength={8}
                  />
                </TableCell>
                <TableCell className='text-right'>{formatCompactNumber(account.totalRails)}</TableCell>
                <TableCell className='text-right'>{formatCompactNumber(account.totalTokens)}</TableCell>
                <TableCell className='text-right'>{formatCompactNumber(account.totalApprovals)}</TableCell>
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
    <h2 className='text-xl font-semibold'>Recent Accounts</h2>
    <Card>
      <div className='py-12'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle>Failed to load accounts</EmptyTitle>
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
    <h2 className='text-xl font-semibold'>Recent Accounts</h2>
    <Card>
      <div className='py-12'>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No accounts found</EmptyTitle>
            <EmptyDescription>There are no accounts to display at the moment.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Card>
  </section>
);

export default RecentAccounts;
