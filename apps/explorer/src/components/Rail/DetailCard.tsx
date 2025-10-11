import { Card } from "@filecoin-pay/ui/components/card";
import { Link } from "react-router-dom";
import { formatAddress } from "@/utils/formatter";

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
        <Link to={linkTo} className='font-medium text-primary hover:underline break-all'>
          {isAddress ? formatAddress(value) : value}
        </Link>
      ) : (
        <span className={`font-medium break-all ${isAddress ? "font-mono text-sm" : ""}`}>
          {isAddress ? formatAddress(value) : value}
        </span>
      )}
    </div>
  </Card>
);
