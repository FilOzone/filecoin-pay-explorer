import { useContext } from "react";
import { SynapseContext } from "@/context/Synapse";

const useSynapse = () => {
  const synapse = useContext(SynapseContext);
  if (!synapse) {
    throw new Error("useSynapse must be used within a SynapseProvider");
  }
  return synapse;
};

export default useSynapse;
