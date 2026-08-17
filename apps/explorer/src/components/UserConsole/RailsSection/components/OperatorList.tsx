import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Rail } from "@filecoin-pay/types";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { CopyableText } from "@/components/shared";
import { knownAddresses } from "@/constants/known-addresses";

interface OperatorGroup {
  address: string;
  name: string | null;
  railCount: number;
}

interface OperatorListProps {
  rails: Rail[];
  onManage: (operatorAddress: string) => void;
}

export const OperatorList: React.FC<OperatorListProps> = ({ rails, onManage }) => {
  const operators = useMemo<OperatorGroup[]>(() => {
    const map = new Map<string, number>();
    for (const rail of rails) {
      const addr = rail.operator.address.toLowerCase();
      map.set(addr, (map.get(addr) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([address, railCount]) => ({
      address,
      name: knownAddresses[address] ?? null,
      railCount,
    }));
  }, [rails]);

  return (
    <div className='flex flex-col gap-2'>
      {operators.map((op) => (
        <div key={op.address} className='flex items-center justify-between rounded-lg border border-border px-4 py-3'>
          <div className='flex flex-col gap-0.5'>
            <span className='font-medium'>{op.name ?? "Unknown operator"}</span>
            <CopyableText
              value={op.address}
              label='Operator address'
              truncate={true}
              truncateLength={6}
              lookupName={false}
              className='text-xs text-muted-foreground font-normal'
            />
          </div>
          <div className='flex items-center gap-4'>
            <span className='text-sm text-muted-foreground'>
              {op.railCount} {op.railCount === 1 ? "rail" : "rails"}
            </span>
            <Button variant='ghost' size='compact' onClick={() => onManage(op.address)} icon={ArrowRight}>
              Manage
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
