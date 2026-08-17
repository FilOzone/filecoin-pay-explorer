import { usePathname } from "next/navigation";

/**
 * Hides the NetworkOptions selector on console routes where the chain switcher
 * lives in the page header instead, or where network selection is irrelevant.
 * Uses exact match to avoid hitting future /console-* routes.
 * TODO: replace with a layout-level prop once the route tree grows — this hook
 * has to be updated manually for each new route that needs the same treatment
 */
const PATHS_WITHOUT_NETWORK = new Set(["/console", "/console/notifications", "/console/notifications/verify"]);

const useShowNetworkOptions = () => {
  const pathname = usePathname();
  return !PATHS_WITHOUT_NETWORK.has(pathname);
};

export default useShowNetworkOptions;
