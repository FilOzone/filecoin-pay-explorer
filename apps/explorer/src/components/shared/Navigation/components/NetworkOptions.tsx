import { Listbox } from "@filecoin-foundation/ui-filecoin/Listbox";
import { GlobeIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { getChain } from "@/constants/chains";
import useNetwork from "@/hooks/useNetwork";
import { supportedChains } from "@/services/wagmi/config";
import type { Network } from "@/types";

const NetworkOptions = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { network, setNetwork } = useNetwork();

  const handleNetworkChange = (newNetwork: Network) => {
    if (network === newNetwork) return;

    // Record the selection before navigating so the route-level sync sees a
    // settled context instead of rewriting the URL back to the old network.
    setNetwork(newNetwork);

    const pathParts = pathname.split("/").filter(Boolean);
    const firstSegment = pathParts[0];

    const validNetworks = supportedChains.map((chain) => chain.slug) as readonly string[];
    const isNetworkRoute = validNetworks.includes(firstSegment);

    if (!isNetworkRoute) {
      router.push(`/${newNetwork}`);
      return;
    }

    const pathWithoutNetwork = pathParts.slice(1);
    const newPath = `/${[newNetwork, ...pathWithoutNetwork].join("/")}`;

    router.push(newPath);
  };

  return (
    <Listbox
      Icon={GlobeIcon}
      options={supportedChains}
      selected={getChain(network)}
      setSelected={(option) => handleNetworkChange(option.slug)}
    />
  );
};

export default NetworkOptions;
