import { Badge } from "@filecoin-pay/ui/components/badge";
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
      <Badge variant='secondary' className='font-normal'>
        <InfinityIcon className='h-3 w-3 mr-1' />
        Unlimited
      </Badge>
    );
  }

  return <span>{formatValue(value, tokenDecimals, symbol, precision)}</span>;
};

export default AllowanceDisplay;
