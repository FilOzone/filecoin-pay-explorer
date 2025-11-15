import type { Account, OperatorApproval } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@filecoin-pay/ui/components/tabs";
import { AlertCircle, ArrowUpCircle, ChevronDown, ChevronRight, Layers, Plus, Shield, Users } from "lucide-react";
import { useState } from "react";
import { useAccountApprovals } from "@/hooks/useAccountDetails";
import { formatAddress, formatToken } from "@/utils/formatter";
import { CopyableText } from "../shared";
import AllowanceDisplay from "../shared/AllowanceDisplay";
import { ApproveOperatorDialog } from "./ApproveOperatorDialog";
import { IncreaseApprovalDialog } from "./IncreaseApprovalDialog";

interface OperatorApprovalsSectionProps {
  account: Account;
}

type GroupBy = "token" | "operator";

export const OperatorApprovalsSectionSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <h2 className='text-2xl font-semibold'>Authorized Services</h2>
    </div>
    <Card>
      <div className='p-4 space-y-4'>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>
    </Card>
  </div>
);

interface ApprovalCardProps {
  approval: OperatorApproval;
  onIncrease: (approval: OperatorApproval) => void;
}

const ApprovalCard: React.FC<ApprovalCardProps> = ({ approval, onIncrease }) => {
  return (
    <div className='flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors'>
      <div className='flex-1 grid grid-cols-1 md:grid-cols-4 gap-4'>
        {/* Operator Info */}
        <div>
          <span className='text-xs text-muted-foreground'>Operator</span>
          <CopyableText
            to={`/operator/${approval.operator.address}`}
            value={approval.operator.address}
            monospace={true}
            label='Operator address'
            truncate={true}
            truncateLength={8}
          />
        </div>

        {/* Token Info */}
        <div>
          <span className='text-xs text-muted-foreground'>Token</span>
          <div className='font-medium'>{approval.token.symbol}</div>
        </div>

        {/* Allowances */}
        <div>
          <span className='text-xs text-muted-foreground'>Allowances</span>
          <div className='text-sm space-y-1'>
            <div>
              <span className='text-muted-foreground'>L: </span>
              <AllowanceDisplay
                value={approval.lockupAllowance}
                tokenDecimals={approval.token.decimals}
                symbol={approval.token.symbol}
                formatValue={formatToken}
                precision={2}
              />
            </div>
            <div>
              <span className='text-muted-foreground'>R: </span>
              <AllowanceDisplay
                value={approval.rateAllowance}
                tokenDecimals={approval.token.decimals}
                symbol={approval.token.symbol}
                formatValue={formatToken}
                precision={2}
              />
            </div>
          </div>
        </div>

        {/* Status & Period */}
        <div className='flex flex-col gap-2'>
          <Badge variant={approval.isApproved ? "default" : "destructive"} className='w-fit'>
            {approval.isApproved ? "Active" : "Revoked"}
          </Badge>
          <span className='text-xs text-muted-foreground'>Max: {approval.maxLockupPeriod.toString()} epochs</span>
        </div>
      </div>

      {/* Actions */}
      {approval.isApproved && (
        <Button size='sm' variant='outline' onClick={() => onIncrease(approval)} className='gap-2 ml-4'>
          <ArrowUpCircle className='h-4 w-4' />
          Increase
        </Button>
      )}
    </div>
  );
};

interface GroupedViewProps {
  approvals: OperatorApproval[];
  groupBy: GroupBy;
  onIncrease: (approval: OperatorApproval) => void;
}

const GroupedView: React.FC<GroupedViewProps> = ({ approvals, groupBy, onIncrease }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Group approvals by token or operator
  const grouped = approvals.reduce(
    (acc, approval) => {
      const key = groupBy === "token" ? approval.token.id : approval.operator.id;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(approval);
      return acc;
    },
    {} as Record<string, OperatorApproval[]>,
  );

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className='space-y-3'>
      {Object.entries(grouped).map(([key, groupApprovals]) => {
        const isExpanded = expandedGroups.has(key);
        const firstApproval = groupApprovals[0];
        const groupLabel =
          groupBy === "token"
            ? `${firstApproval.token.symbol} (${groupApprovals.length} service${groupApprovals.length > 1 ? "s" : ""})`
            : `${formatAddress(firstApproval.operator.address)} (${groupApprovals.length} token${groupApprovals.length > 1 ? "s" : ""})`;

        return (
          <div key={key} className='border rounded-lg overflow-hidden'>
            {/* Group Header */}
            <button
              type='button'
              onClick={() => toggleGroup(key)}
              className='w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors'
            >
              <div className='flex items-center gap-3'>
                {isExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                <div className='text-left'>
                  <div className='font-medium'>{groupLabel}</div>
                  <div className='text-xs text-muted-foreground'>
                    {groupApprovals.filter((a) => a.isApproved).length} active
                  </div>
                </div>
              </div>
              {groupBy === "token" && (
                <div className='flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium'>
                  <Layers className='h-3 w-3' />
                  {firstApproval.token.symbol}
                </div>
              )}
              {groupBy === "operator" && (
                <div className='flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-mono'>
                  <Users className='h-3 w-3' />
                  {formatAddress(firstApproval.operator.address)}
                </div>
              )}
            </button>

            {/* Group Content */}
            {isExpanded && (
              <div className='p-4 space-y-2 bg-card'>
                {groupApprovals.map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} onIncrease={onIncrease} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const OperatorApprovalsSection: React.FC<OperatorApprovalsSectionProps> = ({ account }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>("token");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [increaseDialogOpen, setIncreaseDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<OperatorApproval | null>(null);

  const { data, isLoading, isError } = useAccountApprovals(account.id, 1);

  const handleIncrease = (approval: OperatorApproval) => {
    setSelectedApproval(approval);
    setIncreaseDialogOpen(true);
  };

  if (isLoading) {
    return <OperatorApprovalsSectionSkeleton />;
  }

  if (isError) {
    return (
      <div className='flex flex-col gap-4'>
        <h2 className='text-2xl font-semibold'>Authorized Services</h2>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <AlertCircle className='h-12 w-12 text-muted-foreground' />
                <EmptyTitle>Failed to load authorized services</EmptyTitle>
                <EmptyDescription>Unable to fetch your authorized services. Please try again.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.operatorApprovals.length === 0) {
    return (
      <>
        <div className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-2xl font-semibold'>Authorized Services</h2>
            <Button onClick={() => setApproveDialogOpen(true)} className='gap-2'>
              <Plus className='h-4 w-4' />
              Approve Service
            </Button>
          </div>

          <Card>
            <div className='py-12'>
              <Empty>
                <EmptyHeader>
                  <Shield className='h-12 w-12 text-muted-foreground' />
                  <EmptyTitle>No authorized services</EmptyTitle>
                  <EmptyDescription>
                    You haven't authorized any services yet. Approve an service to let them manage payments on your
                    behalf.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          </Card>
        </div>

        <ApproveOperatorDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen} />
      </>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between flex-wrap gap-4'>
          <h2 className='text-2xl font-semibold'>Authorized Services</h2>
          <div className='flex items-center gap-3'>
            <div className='flex items-center gap-2'>
              <span className='text-sm text-muted-foreground'>Group by:</span>
              <Tabs value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)} className='w-auto'>
                <TabsList className='grid w-full grid-cols-2'>
                  <TabsTrigger value='token' className='gap-1.5'>
                    <Layers className='h-3.5 w-3.5' />
                    Token
                  </TabsTrigger>
                  <TabsTrigger value='operator' className='gap-1.5'>
                    <Users className='h-3.5 w-3.5' />
                    Operator
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Button onClick={() => setApproveDialogOpen(true)} className='gap-2'>
              <Plus className='h-4 w-4' />
              Approve Service
            </Button>
          </div>
        </div>

        <Card className='p-4'>
          <GroupedView approvals={data.operatorApprovals} groupBy={groupBy} onIncrease={handleIncrease} />
        </Card>
      </div>

      {/* Dialogs */}
      <ApproveOperatorDialog
        open={approveDialogOpen}
        operators={data.operatorApprovals.map((approvals) => approvals.operator)}
        tokens={data.operatorApprovals.map((approvals) => approvals.token)}
        onOpenChange={setApproveDialogOpen}
      />
      {selectedApproval && (
        <IncreaseApprovalDialog
          approval={selectedApproval}
          open={increaseDialogOpen}
          onOpenChange={setIncreaseDialogOpen}
        />
      )}
    </>
  );
};
