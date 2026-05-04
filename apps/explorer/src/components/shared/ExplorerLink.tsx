import useNetwork from "@/hooks/useNetwork";
import { explorerUrls } from "@/utils/constants";
import CopyableText from "./CopyableText";

interface ExplorerLinkProps {
  address: string;
  label?: string;
}

const ExplorerLink = ({ address, label = "address" }: ExplorerLinkProps) => {
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
    />
  );
};

export default ExplorerLink;
