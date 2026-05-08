import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Account, Rail } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CircleQuestionMark } from "lucide-react";
import { useState } from "react";
import { getRailStateLabel, getRailStateVariant } from "@/constants/railStates";
import { useAccountRails } from "@/hooks/useAccountDetails";
import { formatDate, formatToken } from "@/utils/formatter";
import { CopyableText, StyledLink } from "../shared";

interface AccountRailsLayoutProps {
  children: React.ReactNode;
}

const AccountRailsLayout: React.FC<AccountRailsLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-20'>{children}</div>
  </PageSection>
);

interface ErrorStateProps {
  refetch: () => void;
  error: Error | null;
}

const ErrorState: React.FC<ErrorStateProps> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load Account Rails'
    titleTag='h2'
    description={error?.message || "Something went wrong"}
  >
    <Button onClick={refetch} variant='primary' size='compact'>
      Retry
    </Button>
  </EmptyStateCard>
);

const NotFoundState: React.FC = () => (
  <EmptyStateCard
    icon={CircleQuestionMark}
    title='No rails found'
    titleTag='h2'
    description='This account is not part of any payment rails yet.'
  ></EmptyStateCard>
);

interface AccountRailsProps {
  account: Account;
}

interface RoleIndicatorProps {
  role: "payer" | "payee";
}

const RoleIndicator: React.FC<RoleIndicatorProps> = ({ role }) => {
  if (role === "payer") {
    return (
      <div className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/10 text-destructive'>
        <ArrowUpRight className='h-3.5 w-3.5' />
        <span className='text-xs font-medium'>Payer</span>
      </div>
    );
  }
  return (
    <div className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400'>
      <ArrowDownLeft className='h-3.5 w-3.5' />
      <span className='text-xs font-medium'>Payee</span>
    </div>
  );
};

interface RailRowProps {
  rail: Rail;
  accountAddress: string;
}

const RailRow: React.FC<RailRowProps> = ({ rail, accountAddress }) => {
  const isPayer = rail.payer.address.toLowerCase() === accountAddress.toLowerCase();
  const counterparty = isPayer ? rail.payee : rail.payer;

  return (
    <TableRow>
      <TableCell className='font-medium'>
        <StyledLink to={`/rail/${rail.railId}`}>{rail.railId.toString()}</StyledLink>
      </TableCell>
      <TableCell>
        <RoleIndicator role={isPayer ? "payer" : "payee"} />
      </TableCell>
      <TableCell className='font-mono text-sm'>
        <CopyableText
          value={counterparty.address}
          to={`/accounts/${counterparty.address}`}
          monospace={true}
          label='Account address'
          truncate={true}
          truncateLength={8}
        />
      </TableCell>
      <TableCell className='font-mono text-sm'>
        <CopyableText
          value={rail.operator.address}
          // to={`/operator/${rail.operator.address}`}
          monospace={true}
          label='Service address'
          truncate={true}
          truncateLength={8}
        />
      </TableCell>
      <TableCell>
        <Badge variant={getRailStateVariant(rail.state)}>{getRailStateLabel(rail.state)}</Badge>
      </TableCell>
      <TableCell className='text-right'>
        {formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 8)}
      </TableCell>
      <TableCell className='text-right'>
        {formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
      </TableCell>
      <TableCell className='text-right text-muted-foreground'>{formatDate(rail.createdAt)}</TableCell>
    </TableRow>
  );
};

export const AccountRails: React.FC<AccountRailsProps> = ({ account }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, error } = useAccountRails(account.id, page);

  const totalPages = account.totalRails ? Math.ceil(Number(account.totalRails) / 10) : 1;

  return (
    <AccountRailsLayout>
      {isLoading && <LoadingStateCard message='Loading Account Rails...' />}
      {isError && <ErrorState refetch={refetch} error={error} />}
      {!isLoading && !isError && (!data || data.rails.length === 0) && <NotFoundState />}

      {!isLoading && !isError && data && data.rails.length > 0 && (
        <div className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-2xl font-semibold'>Rails</h2>
            <span className='text-sm text-muted-foreground'>{account.totalRails.toString()} total</span>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rail ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Payment Rate</TableHead>
                  <TableHead className='text-right'>Settled Amount</TableHead>
                  <TableHead className='text-right'>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rails.map((rail) => (
                  <RailRow key={rail.id} rail={rail} accountAddress={account.address} />
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>

                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setPage(pageNum)}
                        isActive={page === pageNum}
                        className='cursor-pointer'
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </AccountRailsLayout>
  );
};
