import { cn } from "@filecoin-pay/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { resolveAddressName } from "@/constants/known-addresses";
import useNetwork from "@/hooks/useNetwork";
import { useAddressServiceMetadata } from "@/hooks/useServiceMetadata";
import type { Network } from "@/types";
import CopyButton from "./CopyButton";
import OnchainNameMarker, { ONCHAIN_NAME_LABEL } from "./OnchainNameMarker";

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
  lookupName?: boolean;
  /** Read the address's IFilecoinServiceMetadata from chain (operators and validators). */
  lookupServiceMetadata?: boolean;
  /** Overrides the shared network context, which /console pages never sync to the wallet's chain. */
  networkOverride?: Network;
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
  lookupName = true,
  lookupServiceMetadata = false,
  networkOverride,
}: CopyableTextProps) => {
  const { network: contextNetwork } = useNetwork();
  const network = networkOverride ?? contextNetwork;
  // Until (or unless) the read lands, the address renders as it always has.
  const { data: metadata } = useAddressServiceMetadata(
    lookupServiceMetadata && lookupName ? value : undefined,
    network,
  );
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
    (name?.name ??
    (truncate && value.length > truncateLength * 2
      ? `${value.substring(0, truncateLength)}...${value.substring(value.length - truncateLength)}`
      : value))
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
