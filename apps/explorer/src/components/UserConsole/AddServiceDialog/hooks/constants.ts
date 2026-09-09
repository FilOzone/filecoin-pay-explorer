// Deliberately dependency-free: useServiceSelection and useTokenSelection
// each pull in their own heavy chain (wagmi reads, network config, ...), and
// neither should have to import the other's just to share this sentinel.
/** Value of the "Custom … address" entry in both the service and token selects. */
export const CUSTOM_OPTION = "custom";
