import { useContext } from "react";
import { NetworkContext } from "@/context/Network";

const useNetwork = () => {
  const network = useContext(NetworkContext);
  if (!network) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return network;
};

export default useNetwork;
