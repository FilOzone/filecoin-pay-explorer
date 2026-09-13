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
    // One more than a page: asking for exactly a page cannot tell a full page
    // apart from a full page with nothing after it, which would offer a Load
    // more that fetches nothing.
    getVariables: (cursor) => ({ accountId, cursor, first: SERVICES_PAGE_SIZE + 1 }),
    select: (data) => {
      const services = data.accountOperators.slice(0, SERVICES_PAGE_SIZE);
      const hasMore = data.accountOperators.length > SERVICES_PAGE_SIZE;

      // The cursor is the last id shown, never the extra row: the next page has
      // to resume from where this one visibly ended.
      return { services, nextCursor: hasMore ? services.at(-1)?.id : undefined };
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

/** Narrows a pair's rails. Both are exact matches, never partial. */
export type ServiceRailsFilter = {
  railId?: string;
  payee?: string;
};

export type ServiceRailsPage = {
  rails: Rail[];
  /** A row beyond this page came back, so the next page has at least one. */
  hasMore: boolean;
};

export const useAccountServiceRails = (
  accountId: string,
  operatorAddress: string,
  page: number = 1,
  filter: ServiceRailsFilter = {},
  options?: AccountServicesOptions,
) => {
  // The payer and operator are always pinned; the filter only narrows further,
  // so it can never widen the query beyond this payer's own rails.
  const where: Record<string, string> = {
    payer: accountId.toLowerCase(),
    operator: operatorAddress.toLowerCase(),
  };
  if (filter.railId) {
    where.railId = filter.railId;
  }
  if (filter.payee) {
    where.payee = filter.payee.toLowerCase();
  }

  return useGraphQLQuery<AccountOperatorRailsResponse, ServiceRailsPage>({
    queryKey: ["account", accountId, "services", operatorAddress, "rails", page, where],
    query: GET_ACCOUNT_OPERATOR_RAILS,
    variables: {
      where,
      first: ACCOUNT_SERVICE_RAILS_PAGE_SIZE + 1,
      skip: (page - 1) * ACCOUNT_SERVICE_RAILS_PAGE_SIZE,
    },
    select: (data) => ({
      rails: data.rails.slice(0, ACCOUNT_SERVICE_RAILS_PAGE_SIZE),
      hasMore: data.rails.length > ACCOUNT_SERVICE_RAILS_PAGE_SIZE,
    }),
    enabled: !!accountId && !!operatorAddress,
    networkOverride: options?.networkOverride,
  });
};
