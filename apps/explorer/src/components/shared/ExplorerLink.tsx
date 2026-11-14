import useNetwork from "@/hooks/useNetwork";
import { explorerUrls } from "@/utils/constants";
import ServiceAddress from "./ServiceAddress";

interface ExplorerLinkProps {
  address: string;
  label?: string;
}

/** A service (operator) address linked to the network's block explorer. */
const ExplorerLink = ({ address, label = "address" }: ExplorerLinkProps) => {
  const { network } = useNetwork();

  return (
    <ServiceAddress
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
