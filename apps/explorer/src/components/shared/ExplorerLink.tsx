import useNetwork from "@/hooks/useNetwork";
import { explorerUrls } from "@/utils/constants";
import CopyableText from "./CopyableText";

interface ExplorerLinkProps {
  address: string;
  label?: string;
  serviceMetadata?: boolean;
}

const ExplorerLink = ({ address, label = "address", serviceMetadata }: ExplorerLinkProps) => {
  const { network } = useNetwork();

  return (
    <CopyableText
      value={address}
      to={`${explorerUrls[network]}/address/${address}`}
      external
      monospace={true}
      label={label}
      truncate={true}
      serviceMetadata={serviceMetadata}
    />
  );
};

export default ExplorerLink;
