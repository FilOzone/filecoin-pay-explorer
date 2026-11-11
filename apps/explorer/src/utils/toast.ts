import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
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

    case "updateApproval":
      return {
        pending: {
          title: "Updating Limits",
          description: operator ? `Updating ${token} limits for ${formatAddress(operator)}...` : "Processing...",
        },
        success: {
          title: "Limits Updated",
          description: operator ? `New ${token} limits set for ${formatAddress(operator)}` : "Spending limits updated",
        },
        error: {
          title: "Limit Update Failed",
          description: operator ? `Failed to update limits for ${formatAddress(operator)}` : "Failed to update limits",
        },
      }[status];

    case "revokeApproval":
      return {
        pending: {
          title: "Revoking Service",
          description: operator ? `Revoking ${formatAddress(operator)}...` : "Processing...",
        },
        success: {
          title: "Service Revoked",
          description: operator
            ? `${formatAddress(operator)} can no longer open ${token} rails`
            : "Service approval revoked",
        },
        error: {
          title: "Revoke Failed",
          description: operator ? `Failed to revoke ${formatAddress(operator)}` : "Failed to revoke service",
        },
      }[status];

    case "settleRail":
      return {
        pending: {
          title: railId ? `Settling Rail #${railId}` : "Settling Rail",
          description: `Processing settlement...`,
        },
        success: {
          title: `Rail #${railId} Settled`,
          description: railId ? `Rail #${railId} settled for ${amount} ${token}` : "Rail settlement complete",
        },
        error: {
          title: "Settlement Failed",
          description: railId ? `Failed to settle Rail #${railId}` : "Rail settlement rejected",
        },
      }[status];

    case "terminateDataSet":
      return {
        pending: {
          title: `Terminating Data Set #${metadata.dataSetId}`,
          description: "Processing termination...",
        },
        success: {
          title: "Data Set Terminated",
          description: `Payment for data set #${metadata.dataSetId} ends within ${TIME_CONSTANTS.DEFAULT_LOCKUP_DAYS} days`,
        },
        error: {
          title: "Termination Failed",
          description: `Failed to terminate data set #${metadata.dataSetId}`,
        },
      }[status];

    case "createSessionKey":
      return {
        pending: {
          title: metadata.keyName ? `Creating session key "${metadata.keyName}"` : "Creating session key",
          description: "Waiting for confirmation...",
        },
        success: {
          title: "Session Key Created",
          description: metadata.keyName ? `"${metadata.keyName}" is now active` : "Your session key is now active",
        },
        error: {
          title: "Session Key Creation Failed",
          description: "The transaction was rejected or failed",
        },
      }[status];

    case "authorizeSessionKey":
      return {
        pending: {
          title: metadata.keyName ? `Adding scopes to "${metadata.keyName}"` : "Adding scopes to session key",
          description: "Waiting for confirmation...",
        },
        success: {
          title: "Scopes Added",
          description: metadata.keyName
            ? `"${metadata.keyName}" now holds the new scopes`
            : "The session key now holds the new scopes",
        },
        error: {
          title: "Adding Scopes Failed",
          description: "The transaction was rejected or failed",
        },
      }[status];

    case "revokeSessionKey":
      return {
        pending: {
          title: metadata.keyName ? `Revoking session key "${metadata.keyName}"` : "Revoking session key",
          description: "Waiting for confirmation...",
        },
        success: {
          title: "Session Key Revoked",
          description: metadata.keyName ? `"${metadata.keyName}" can no longer sign` : "The key can no longer sign",
        },
        error: {
          title: "Revoke Failed",
          description: "The revoke transaction was rejected or failed",
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
