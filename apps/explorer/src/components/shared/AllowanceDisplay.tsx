import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Infinity as InfinityIcon } from "lucide-react";
import { isUnlimitedValue } from "@/utils/formatter";

interface AllowanceDisplayProps {
  value: number | string | bigint;
  tokenDecimals: number | bigint;
  symbol: string;
  formatValue: (
    value: number | string | bigint,
    decimals: number | bigint,
    symbol: string,
    precision: number,
  ) => string;
  precision?: number;
}

const AllowanceDisplay: React.FC<AllowanceDisplayProps> = ({
  value,
  tokenDecimals,
  symbol,
  formatValue,
  precision = 2,
}) => {
  if (isUnlimitedValue(value)) {
    return (
      <div className='flex justify-start'>
        <Badge variant='secondary' icon={InfinityIcon}>
          Unlimited
        </Badge>
      </div>
    );
  }

  return <span>{formatValue(value, tokenDecimals, symbol, precision)}</span>;
};

export default AllowanceDisplay;
