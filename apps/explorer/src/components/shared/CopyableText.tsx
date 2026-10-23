import { cn } from "@filecoin-pay/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { resolveAddressName } from "@/constants/known-addresses";
import useNetwork from "@/hooks/useNetwork";
import { useAddressServiceMetadata } from "@/hooks/useServiceMetadata";
import { formatAddress } from "@/utils/formatter";
import CopyButton from "./CopyButton";
import OnchainNameMarker, { ONCHAIN_NAME_LABEL } from "./OnchainNameMarker";

interface CopyableTextProps {
  value: string;
  to?: string;
  label?: string;
  truncate?: boolean;
  external?: boolean;
  className?: string;
  linkClassName?: string;
  monospace?: boolean;
  lookupName?: boolean;
  /** Read the address's IFilecoinServiceMetadata from chain (operators and validators). */
  serviceMetadata?: boolean;
}

const CopyableText = ({
  value,
  to,
  label = "Text",
  truncate = false,
  external = false,
  className,
  linkClassName,
  monospace = true,
  lookupName = true,
  serviceMetadata = false,
}: CopyableTextProps) => {
  const { network } = useNetwork();
  // Until (or unless) the read lands, the address renders as it always has.
  const { data: metadata } = useAddressServiceMetadata(serviceMetadata && lookupName ? value : undefined, network);
  const name = lookupName ? resolveAddressName(value, metadata?.name) : undefined;
  const onchain = name?.source === "onchain";
  const description = name?.source === "rejected" ? undefined : metadata?.description;
  const title = [onchain && `${ONCHAIN_NAME_LABEL}: ${name.name}`, description, value].filter(Boolean).join("\n");
  const displayValue = onchain ? (
    <>
      {/* Up to 256 chars of contract text; the tooltip carries the full name. */}
      <span className='inline-block max-w-64 truncate align-bottom'>{name.name}</span>
      <OnchainNameMarker />
    </>
  ) : (
    (name?.name ?? (truncate ? formatAddress(value) : value))
  );

  return (
    <div
      className={cn("group flex items-center gap-1 font-medium text-base", monospace && "font-mono text-sm", className)}
    >
      {to ? (
        <Link
          href={external ? to : `/${network}${to}`}
          className={cn(
            "text-link inline-flex items-center text-pretty whitespace-nowrap pointer-coarse:min-h-11",
            linkClassName,
          )}
          title={title}
          target={external ? "_blank" : "_self"}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {displayValue}
          {external && <ExternalLink className='ml-1 h-4 w-4 inline-block' />}
        </Link>
      ) : (
        <span className='inline-flex items-center whitespace-nowrap' title={title}>
          {displayValue}
        </span>
      )}
      <CopyButton
        value={value}
        className='opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 transition-opacity ml-1'
        successMessage={`${label} copied to clipboard`}
      />
    </div>
  );
};

export default CopyableText;
