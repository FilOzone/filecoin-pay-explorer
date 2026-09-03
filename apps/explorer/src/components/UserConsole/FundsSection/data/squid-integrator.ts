/** Public integrator ID Squid issued for Filecoin testing; an override comes from the environment. */
export const DEFAULT_SQUID_INTEGRATOR_ID = "filecoin-testing-94a4a25a-d40b-41cb-b148-e96098862";

/** The integrator ID sent with every Squid request. The value is inlined at build time. */
export function readSquidIntegratorId(): string {
  return process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID?.trim() || DEFAULT_SQUID_INTEGRATOR_ID;
}
