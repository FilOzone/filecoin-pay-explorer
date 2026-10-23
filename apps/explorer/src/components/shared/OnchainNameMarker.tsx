import { cn } from "@filecoin-pay/ui/lib/utils";
import { BadgeInfo } from "lucide-react";

export const ONCHAIN_NAME_LABEL = "Self-reported on-chain name";

/** Sets a contract's own (unverified) name apart from the curated ones. */
const OnchainNameMarker = ({ className }: { className?: string }) => (
  <span
    role='img'
    aria-label={ONCHAIN_NAME_LABEL}
    title={ONCHAIN_NAME_LABEL}
    className={cn("inline-flex shrink-0", className)}
  >
    <BadgeInfo aria-hidden className='size-3.5 text-muted-foreground' />
  </span>
);

export default OnchainNameMarker;
