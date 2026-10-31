import { BaseError, UserRejectedRequestError } from "viem";

// wagmi/viem usually wraps the rejection, so walk the cause chain rather than
// matching the top-level error (UserRejectedRequestError extends BaseError, so a
// direct throw is covered too).
export function isUserRejection(err: unknown): boolean {
  return err instanceof BaseError && Boolean(err.walk((e) => e instanceof UserRejectedRequestError));
}
