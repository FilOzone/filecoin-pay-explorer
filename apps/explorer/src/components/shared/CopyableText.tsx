import { cn } from "@filecoin-pay/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import CopyButton from "./CopyButton";

interface CopyableTextProps {
  value: string;
  to?: string;
  label?: string;
  truncate?: boolean;
  external?: boolean;
  truncateLength?: number;
  className?: string;
  linkClassName?: string;
  monospace?: boolean;
}

const CopyableText = ({
  value,
  to,
  label = "Text",
  truncate = false,
  external = false,
  truncateLength = 8,
  className,
  linkClassName,
  monospace = true,
}: CopyableTextProps) => {
  const displayValue =
    truncate && value.length > truncateLength * 2
      ? `${value.substring(0, truncateLength)}...${value.substring(value.length - truncateLength)}`
      : value;

  return (
    <div className={cn("group flex items-center gap-1", monospace && "font-mono text-sm", className)}>
      {to ? (
        <Link
          to={to}
          className={cn(
            "text-link hover:text-link-hover hover:underline flex items-center gap-1 transition-colors font-medium",
            linkClassName,
          )}
          title={value}
          target={external ? "_blank" : "_self"}
        >
          {displayValue}
          {external && <ExternalLink className='ml-1 h-4 w-4' />}
        </Link>
      ) : (
        <span title={value}>{displayValue}</span>
      )}
      <CopyButton
        value={value}
        className='opacity-0 group-hover:opacity-100 transition-opacity ml-1'
        successMessage={`${label} copied to clipboard`}
      />
    </div>
  );
};

export default CopyableText;
