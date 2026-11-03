import useNetwork from "@/hooks/useNetwork";
import { explorerUrls } from "@/utils/constants";
import CopyableText from "./CopyableText";

interface ExplorerLinkProps {
  address: string;
  label?: string;
  lookupServiceMetadata?: boolean;
}

const ExplorerLink = ({ address, label = "address", lookupServiceMetadata }: ExplorerLinkProps) => {
  const { network } = useNetwork();

  return (
    <CopyableText
      value={address}
      to={`${explorerUrls[network]}/address/${address}`}
      external
      monospace={true}
      label={label}
      truncate={true}
      truncateLength={8}
      lookupServiceMetadata={lookupServiceMetadata}
    />
  );
};

export default ExplorerLink;
