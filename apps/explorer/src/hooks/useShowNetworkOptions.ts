import { usePathname } from "next/navigation";

/**
 * Hides the NetworkOptions selector on the console page, where the chain switcher
 * lives in the page header instead. Uses exact match to avoid hitting future /console-* routes.
 * TODO: replace with a layout-level prop once the route tree grows — this hook
 * has to be updated manually for each new route that needs the same treatment
 */
const useShowNetworkOptions = () => {
  const pathname = usePathname();
  return pathname !== "/console";
};

export default useShowNetworkOptions;
