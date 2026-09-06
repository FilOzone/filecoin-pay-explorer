import type { AccountOperator, Operator, Rail } from "@filecoin-pay/types";
import { GET_ACCOUNT_OPERATOR, GET_ACCOUNT_OPERATOR_RAILS, GET_ACCOUNT_OPERATORS } from "@/services/grapql/queries";
import type { Network } from "@/types";
import { useGraphQLInfiniteQuery, useGraphQLQuery } from "./useGraphQLQuery";

/**
 * Reads a payer's service relationships from the `AccountOperator` projection.
 * Every read here is payer-side: the console shows the connected account as the
 * payer, never the payee.
 */

/** The subset of `AccountOperator` the console renders. */
export type AccountService = Pick<
  AccountOperator,
  "id" | "totalRails" | "totalActiveRails" | "totalApprovals" | "totalActiveApprovals"
> & {
  operator: Pick<Operator, "id" | "address">;
};

interface AccountOperatorsResponse {
  accountOperators: AccountService[];
}

interface AccountOperatorResponse {
  accountOperator: AccountService | null;
}

interface AccountOperatorRailsResponse {
  rails: Rail[];
}

interface AccountServicesOptions {
  networkOverride?: Network;
}

type AccountServicesPage = {
  services: AccountService[];
  /** The id to resume from, or undefined once the last page is reached. */
  nextCursor: string | undefined;
};

const SERVICES_PAGE_SIZE = 10;

export const ACCOUNT_SERVICE_RAILS_PAGE_SIZE = 10;

/** Mirrors the subgraph's `getAccountOperatorEntityId`: payer bytes then operator bytes. */
export function getAccountOperatorId(accountId: string, operatorAddress: string): string {
  return `${accountId.toLowerCase()}${operatorAddress.toLowerCase().replace(/^0x/, "")}`;
}

/**
 * `AccountOperator.id` is the payer address concatenated with the operator
 * address, so every id for this payer sorts after the payer address itself.
 * That makes the account id the opening cursor.
 */
export const useAccountServices = (accountId: string, options?: AccountServicesOptions) =>
  useGraphQLInfiniteQuery<AccountOperatorsResponse, AccountServicesPage, string>({
    queryKey: ["account", accountId, "services"],
    query: GET_ACCOUNT_OPERATORS,
    getVariables: (cursor) => ({ accountId, cursor, first: SERVICES_PAGE_SIZE }),
    select: (data) => {
      const services = data.accountOperators;
      const isFullPage = services.length === SERVICES_PAGE_SIZE;

      return { services, nextCursor: isFullPage ? services.at(-1)?.id : undefined };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: accountId,
    networkOverride: options?.networkOverride,
  });

/**
 * One payer/operator relationship. Resolves to `null` when the connected payer
 * has no relationship with the operator, which the service route renders as not
 * found rather than as an empty rail list.
 */
export const useAccountService = (accountId: string, operatorAddress: string, options?: AccountServicesOptions) =>
  useGraphQLQuery<AccountOperatorResponse, AccountService | null>({
    queryKey: ["account", accountId, "services", operatorAddress],
    query: GET_ACCOUNT_OPERATOR,
    variables: { id: getAccountOperatorId(accountId, operatorAddress) },
    select: (data) => data.accountOperator,
    enabled: !!accountId && !!operatorAddress,
    networkOverride: options?.networkOverride,
  });

export const useAccountServiceRails = (
  accountId: string,
  operatorAddress: string,
  page: number = 1,
  options?: AccountServicesOptions,
) =>
  useGraphQLQuery<AccountOperatorRailsResponse, Rail[]>({
    queryKey: ["account", accountId, "services", operatorAddress, "rails", page],
    query: GET_ACCOUNT_OPERATOR_RAILS,
    variables: {
      accountId,
      operatorId: operatorAddress.toLowerCase(),
      first: ACCOUNT_SERVICE_RAILS_PAGE_SIZE,
      skip: (page - 1) * ACCOUNT_SERVICE_RAILS_PAGE_SIZE,
    },
    select: (data) => data.rails,
    enabled: !!accountId && !!operatorAddress,
    networkOverride: options?.networkOverride,
  });
