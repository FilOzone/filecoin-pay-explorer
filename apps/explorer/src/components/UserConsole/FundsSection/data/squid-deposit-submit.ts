export function claimSquidDepositSubmission(submitting: { current: boolean }): boolean {
  if (submitting.current) return false;
  submitting.current = true;
  return true;
}

export function releaseSquidDepositSubmission(submitting: { current: boolean }): void {
  submitting.current = false;
}
