import { cn } from "@filecoin-pay/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { knownAddresses } from "@/constants/known-addresses";
import useNetwork from "@/hooks/useNetwork";
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
  lookUpName?: boolean;
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
  lookUpName = true,
}: CopyableTextProps) => {
  const displayValue =
    (lookUpName && knownAddresses[value.toLowerCase()]) ||
    (truncate && value.length > truncateLength * 2
      ? `${value.substring(0, truncateLength)}...${value.substring(value.length - truncateLength)}`
      : value);
  const { network } = useNetwork();

  return (
    <div
      className={cn("group flex items-center gap-1 font-medium text-base", monospace && "font-mono text-sm", className)}
    >
      {to ? (
        <Link
          href={external ? to : `/${network}${to}`}
          className={cn("text-link inline-block text-pretty whitespace-nowrap", linkClassName)}
          title={value}
          target={external ? "_blank" : "_self"}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {displayValue}
          {external && <ExternalLink className='ml-1 h-4 w-4 inline-block' />}
        </Link>
      ) : (
        <span className='whitespace-nowrap' title={value}>
          {displayValue}
        </span>
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
