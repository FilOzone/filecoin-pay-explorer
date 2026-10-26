/** Wallet and viem errors as the console shows them. */

export function isUserRejectedRequest(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if (
      ("code" in current && current.code === 4001) ||
      ("name" in current && current.name === "UserRejectedRequestError")
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

const MAX_ERROR_MESSAGE_LENGTH = 240;

/**
 * What the dialog shows for a failure. viem errors carry the whole request
 * (calldata included) in `message`; their `shortMessage` and `details` say
 * what happened, which is all a reader needs.
 */
export function walletErrorMessage(error: unknown, fallback: string): string {
  if (isUserRejectedRequest(error)) return "Transaction cancelled in your wallet.";
  if (!(error instanceof Error)) return fallback;
  const short = "shortMessage" in error && typeof error.shortMessage === "string" ? error.shortMessage : undefined;
  const details = "details" in error && typeof error.details === "string" ? error.details.trim() : "";
  let message = error.message;
  if (short) message = details && !short.includes(details) ? `${short} ${details}` : short;
  return message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…` : message;
}
