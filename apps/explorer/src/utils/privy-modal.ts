/**
 * The id Privy puts on its dialog element (`<Dialog id="privy-dialog">` in
 * @privy-io/react-auth), also the hook Privy documents for custom CSS.
 */
const PRIVY_DIALOG_ID = "privy-dialog";

const DEFAULT_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 50;

export const isPrivyDialogMounted = () =>
  typeof document !== "undefined" && document.getElementById(PRIVY_DIALOG_ID) !== null;

type WaitOptions = {
  /** Overridable for tests; defaults to checking the DOM for Privy's dialog. */
  isMounted?: () => boolean;
  timeoutMs?: number;
};

/**
 * Resolves once Privy's wallet dialog has left the DOM, or after `timeoutMs`.
 *
 * Privy (@privy-io/react-auth 3.39–3.40) keeps the dialog mounted through its
 * ~150 ms close animation and never clears the screen it was showing. A wallet
 * request that arrives inside that window replaces the modal's data underneath
 * the still-mounted screen; `SignRequestScreen` destructures `data.signMessage`
 * unguarded, so a signature followed straight away by a transaction throws
 * "Cannot destructure property 'method' of 's.signMessage'" and unmounts the
 * page. Waiting for the dialog to unmount closes that window.
 *
 * Returns `true` when the dialog is gone, `false` on timeout. Callers proceed
 * either way: the wait is a guard against the race, not a precondition.
 */
export async function waitForPrivyModalToClose({
  isMounted = isPrivyDialogMounted,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WaitOptions = {}): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isMounted()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return true;
}
