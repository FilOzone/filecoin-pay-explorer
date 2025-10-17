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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@filecoin-pay/ui/components/select";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { AlertCircle, Info, Trophy } from "lucide-react";
import { useState } from "react";
import useOperatorsLeaderboard, { type OperatorOrderBy } from "@/hooks/useOperatorsLeaderboard";
import { formatCompactNumber } from "@/utils/formatter";
import { CopyableText, StyledLink } from "../shared";

const OperatorsLeaderboard = () => {
  const [orderBy, setOrderBy] = useState<OperatorOrderBy>("totalRails");
  const { data, isLoading, isError, error, refetch } = useOperatorsLeaderboard(10, orderBy);

  const sortOptions = [
    { value: "totalRails" as OperatorOrderBy, label: "Total Rails" },
    { value: "totalTokens" as OperatorOrderBy, label: "Total Tokens" },
    { value: "totalApprovals" as OperatorOrderBy, label: "Total Approvals" },
  ];

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
        <div className='flex items-center gap-2'>
          <Trophy className='h-5 w-5 text-yellow-500' />
          <h2 className='text-xl font-semibold'>Operators Leaderboard</h2>
        </div>
        <div className='flex items-center gap-3'>
          <Select value={orderBy} onValueChange={(value) => setOrderBy(value as OperatorOrderBy)}>
            <SelectTrigger className='w-[180px]'>
              <SelectValue placeholder='Sort by...' />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <StyledLink to='/operators' className='text-sm'>
            View All
          </StyledLink>
        </div>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>#</TableHead>
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
                      How many accounts have given this payment manager permission to handle their payments
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((operator, index) => (
              <TableRow key={operator.id}>
                <TableCell className='font-semibold text-muted-foreground'>{index + 1}</TableCell>
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
    <h2 className='text-xl font-semibold'>Operators Leaderboard</h2>
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
    <h2 className='text-xl font-semibold'>Operators Leaderboard</h2>
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

export default OperatorsLeaderboard;
