import useNetwork from "@/hooks/useNetwork";
import { explorerUrls } from "@/utils/constants";
import CopyableText from "./CopyableText";

interface ExplorerLinkProps {
  address: string;
  label?: string;
  /** "address" (default) links to /address/{address}; "tx" links to /tx/{address}. */
  kind?: "address" | "tx";
  /** Explorer base URL to use instead of the one derived from the ambient network. Only takes effect when `pinned` is set. */
  explorerUrl?: string;
  /**
   * Use `explorerUrl` instead of the ambient network's — for flows whose
   * address may not belong to the app's currently selected network (e.g. a
   * wallet-scoped submission), so a divergence between the two can't mix
   * networks. An undefined `explorerUrl` then renders the address unlinked
   * rather than falling back to the (possibly wrong) ambient network.
   */
  pinned?: boolean;
}

const ExplorerLink = ({
  address,
  label = "address",
  kind = "address",
  explorerUrl,
  pinned = false,
}: ExplorerLinkProps) => {
  const { network } = useNetwork();
  const resolvedExplorerUrl = pinned ? explorerUrl : (explorerUrl ?? explorerUrls[network]);

  return (
    <CopyableText
      value={address}
      to={resolvedExplorerUrl ? `${resolvedExplorerUrl}/${kind}/${address}` : undefined}
      external
      monospace={true}
      label={label}
      truncate={true}
      truncateLength={8}
    />
  );
};

export default ExplorerLink;
