import type { QueryClient } from "@tanstack/react-query";
import { type Address, isAddress } from "viem";
import { z } from "zod";
import { GET_ACCOUNT_OPERATOR_TOKEN_APPROVAL } from "@/services/grapql/queries";

/** Change this namespace when the persisted shape becomes incompatible. */
export const ADD_SERVICE_STORAGE_NAMESPACE = "filecoin-pay:add-service:v1";

const SUBMIT_FUNCTIONS = ["setOperatorApproval", "depositWithPermitAndApproveOperator"] as const;

const addressSchema = z.custom<Address>((value) => typeof value === "string" && isAddress(value), {
  message: "expected a 0x-prefixed address",
});

/** JSON-safe context needed to resume an Add Service transaction. Sets the pattern for future persisted-transaction flows. */
const addServiceContextSchema = z.object({
  operatorAddress: addressSchema,
  tokenAddress: addressSchema,
  tokenSymbol: z.string(),
  tokenDecimals: z.number().int().nonnegative(),
  /** "0" for an approval submitted without a deposit. */
  depositAmountWei: z.string().regex(/^\d+$/),
  functionName: z.enum(SUBMIT_FUNCTIONS),
});

export type AddServiceContext = z.infer<typeof addServiceContextSchema>;

// Identity passthrough required by useIndexedTransaction's generic
// `encodeContext: (context: T) => unknown` — the context is already JSON-safe.
export function encodeAddServiceContext(context: AddServiceContext): unknown {
  return context;
}

export function decodeAddServiceContext(value: unknown): AddServiceContext | null {
  const result = addServiceContextSchema.safeParse(value);
  return result.success ? result.data : null;
}

interface AccountOperatorTokenApprovalResponse {
  operatorApprovals: Array<{ id: string }>;
  _meta: { block: { number: number } };
}

/**
 * Checks whether the selected network's subgraph has indexed this approval.
 * The block gate prevents an older matching approval from completing the flow.
 */
export function buildIsAddServiceIndexed(
  executeQuery: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>,
  ownerAddress: Address,
): (context: AddServiceContext, confirmedBlockNumber: bigint) => Promise<boolean> {
  return async (context, confirmedBlockNumber) => {
    const data = await executeQuery<AccountOperatorTokenApprovalResponse>(GET_ACCOUNT_OPERATOR_TOKEN_APPROVAL, {
      accountId: ownerAddress.toLowerCase(),
      operatorId: context.operatorAddress.toLowerCase(),
      tokenId: context.tokenAddress.toLowerCase(),
    });
    if (BigInt(data._meta.block.number) < confirmedBlockNumber) return false;
    return data.operatorApprovals.length > 0;
  };
}

/**
 * Refreshes Add Service data after indexing. Account keys are matched
 * case-insensitively because callers use both checksummed and lowercase IDs.
 */
export function invalidateAddServiceQueries(queryClient: QueryClient, ownerAddress: Address): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) => {
        const [scope, id] = query.queryKey;
        return scope === "account" && typeof id === "string" && id.toLowerCase() === ownerAddress.toLowerCase();
      },
    }),
    queryClient.invalidateQueries({ queryKey: ["payments", "account-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["approvedOperatorClients"] }),
  ]);
}
