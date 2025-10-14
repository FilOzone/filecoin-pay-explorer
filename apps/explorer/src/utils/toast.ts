import type { TransactionMetadata } from "@/types";
import { formatAddress } from "./formatter";

export const getToastContent = (metadata: TransactionMetadata, status: "pending" | "success" | "error") => {
  const { type, amount, token, operator, recipient, railId } = metadata;

  switch (type) {
    case "deposit":
      return {
        pending: {
          title: "Depositing Funds",
          description: `Processing ${amount} ${token}...`,
        },
        success: {
          title: "Deposit Successful",
          description: `${amount} ${token} added to your account`,
        },
        error: {
          title: "Deposit Failed",
          description: `Failed to deposit ${amount} ${token}`,
        },
      }[status];

    case "depositAndApprove":
      return {
        pending: {
          title: "Depositing & Approving",
          description: `Processing ${amount} ${token} and operator approval...`,
        },
        success: {
          title: "Deposit & Approval Complete",
          description: `${amount} ${token} deposited. ${operator && formatAddress(operator)} approved`,
        },
        error: {
          title: "Deposit & Approval Failed",
          description: `Failed to deposit ${amount} ${token} and approve operator`,
        },
      }[status];

    case "withdraw":
      return {
        pending: {
          title: "Processing Withdrawal",
          description: `Withdrawing ${amount} ${token}...`,
        },
        success: {
          title: "Withdrawal Complete",
          description: recipient
            ? `${amount} ${token} sent to ${formatAddress(recipient)}`
            : `${amount} ${token} withdrawn`,
        },
        error: {
          title: "Withdrawal Failed",
          description: `Failed to withdraw ${amount} ${token}`,
        },
      }[status];

    case "approveOperator":
      return {
        pending: {
          title: "Approving Operator",
          description: operator ? `Approving ${formatAddress(operator)}...` : "Processing approval...",
        },
        success: {
          title: "Operator Approved",
          description: operator
            ? `${formatAddress(operator)} can now manage your ${token} funds`
            : "Operator approval complete",
        },
        error: {
          title: "Operator Approval Failed",
          description: operator ? `Failed to approve ${formatAddress(operator)}` : "Approval transaction rejected",
        },
      }[status];

    case "increaseApproval":
      return {
        pending: {
          title: "Increasing Limits",
          description: operator ? `Updating limits for ${formatAddress(operator)}...` : "Processing...",
        },
        success: {
          title: "Limits Increased",
          description: operator ? `New limits set for ${formatAddress(operator)}` : "Approval limits updated",
        },
        error: {
          title: "Limit Increase Failed",
          description: operator ? `Failed to update limits for ${formatAddress(operator)}` : "Failed to update limits",
        },
      }[status];

    case "settleRail":
      return {
        pending: {
          title: railId ? `Settling Rail #${railId}` : "Settling Rail",
          description: `Processing settlement...`,
        },
        success: {
          title: "Rail Settled",
          description: railId ? `Rail #${railId} settled for ${amount} ${token}` : "Rail settlement complete",
        },
        error: {
          title: "Settlement Failed",
          description: railId ? `Failed to settle Rail #${railId}` : "Rail settlement rejected",
        },
      }[status];

    case "terminateRail":
      return {
        pending: {
          title: railId ? `Terminating Rail #${railId}` : "Terminating Rail",
          description: "Processing termination...",
        },
        success: {
          title: "Rail Terminated",
          description: railId ? `Rail #${railId} has been terminated` : "Rail termination complete",
        },
        error: {
          title: "Termination Failed",
          description: railId ? `Failed to terminate Rail #${railId}` : "Rail termination rejected",
        },
      }[status];

    default:
      return {
        pending: {
          title: "Processing Transaction",
          description: "Waiting for confirmation...",
        },
        success: {
          title: "Transaction Complete",
          description: "Your transaction was successful",
        },
        error: {
          title: "Transaction Failed",
          description: "Transaction was rejected or failed",
        },
      }[status];
  }
};
