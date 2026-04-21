import type { Operator } from "@filecoin-pay/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { CopyableText } from "@/components/shared";
import useNetwork from "@/hooks/useNetwork";
import { explorerUrls } from "@/utils/constants";
import { formatCompactNumber } from "@/utils/formatter";

const columnHelper = createColumnHelper<Operator>();

export const columns = [
  columnHelper.display({
    id: "rank",
    header: "#",
    cell: (info) => <span className='font-semibold text-muted-foreground'>{info.row.index + 1}</span>,
    size: 48,
  }),
  columnHelper.accessor("address", {
    header: "Address",
    cell: (info) => {
      const { network } = useNetwork();
      return (
        <CopyableText
          value={info.getValue()}
          to={`${explorerUrls[network]}/address/${info.getValue()}`}
          external
          monospace={true}
          label='Service address'
          truncate={true}
          truncateLength={8}
        />
      );
    },
  }),
  columnHelper.accessor("totalRails", {
    header: "Total Rails",
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
  columnHelper.accessor("totalTokens", {
    header: "Total Tokens",
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
  columnHelper.accessor("totalApprovals", {
    header: () => (
      <div className='flex items-center gap-1.5'>
        Total Approvals
        <Tooltip>
          <TooltipTrigger asChild>
            <button type='button' className='inline-flex'>
              <Info className='h-3.5 w-3.5 text-muted-foreground cursor-help' />
            </button>
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            How many accounts have given this payment manager permission to handle their payments
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    cell: (info) => formatCompactNumber(info.getValue()),
  }),
];
