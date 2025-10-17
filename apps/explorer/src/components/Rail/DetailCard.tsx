import { Card } from "@filecoin-pay/ui/components/card";
import { formatAddress } from "@/utils/formatter";
import { CopyableText } from "../shared";

interface DetailCardProps {
  label: string;
  value: string;
  isAddress?: boolean;
  linkTo?: string;
}

export const DetailCard: React.FC<DetailCardProps> = ({ label, value, isAddress = false, linkTo }) => (
  <Card className='p-4'>
    <div className='flex flex-col gap-1'>
      <span className='text-sm text-muted-foreground'>{label}</span>
      {linkTo ? (
        <CopyableText value={value} monospace={true} label={`${label} address`} truncate={true} truncateLength={8} />
      ) : (
        <span className={`font-medium break-all ${isAddress ? "font-mono text-sm" : ""}`}>
          {isAddress ? formatAddress(value) : value}
        </span>
      )}
    </div>
  </Card>
);
