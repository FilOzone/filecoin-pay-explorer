import { usePathname } from "next/navigation";

const useShowNetworkOptions = () => {
  const pathname = usePathname();
  return !pathname.startsWith("/console");
};

export default useShowNetworkOptions;
