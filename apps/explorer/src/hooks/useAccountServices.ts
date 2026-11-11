import type {
  AccountOperator,
  OneTimePayment,
  Operator,
  OperatorApproval,
  Rail,
  Token,
  UserToken,
} from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import {
  GET_ACCOUNT_OPERATOR,
  GET_ACCOUNT_OPERATOR_RAILS,
  GET_ACCOUNT_OPERATORS,
  GET_SERVICE_METRICS,
  GET_SERVICE_ONE_TIME_PAYMENTS,
} from "@/services/grapql/queries";
import type { Network } from "@/types";
import { fetchAllPages, fetchSubgraphMeta, SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import { toAccountId } from "@/utils/hexUtils";
import { useGraphQLClient, useGraphQLInfiniteQuery, useGraphQLQuery } from "./useGraphQLQuery";

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
  return `${toAccountId(accountId)}${operatorAddress.toLowerCase().replace(/^0x/, "")}`;
}

/**
 * `AccountOperator.id` is the payer address concatenated with the operator
 * address, so every id for this payer sorts after the payer address itself.
 * That makes the account id the opening cursor.
 */
export const useAccountServices = (address: string, options?: AccountServicesOptions) => {
  const accountId = toAccountId(address);

  return useGraphQLInfiniteQuery<AccountOperatorsResponse, AccountServicesPage, string>({
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
};

/**
 * One payer/operator relationship. Resolves to `null` when the connected payer
 * has no relationship with the operator, which the service route renders as not
 * found rather than as an empty rail list.
 */
export const useAccountService = (address: string, operatorAddress: string, options?: AccountServicesOptions) => {
  const accountId = toAccountId(address);
  const operatorId = toAccountId(operatorAddress);

  return useGraphQLQuery<AccountOperatorResponse, AccountService | null>({
    queryKey: ["account", accountId, "services", operatorId],
    query: GET_ACCOUNT_OPERATOR,
    variables: { id: getAccountOperatorId(accountId, operatorId) },
    select: (data) => data.accountOperator,
    enabled: !!accountId && !!operatorId,
    networkOverride: options?.networkOverride,
  });
};

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
  address: string,
  operatorAddress: string,
  page: number = 1,
  filter: ServiceRailsFilter = {},
  options?: AccountServicesOptions,
) => {
  const accountId = toAccountId(address);
  const operatorId = toAccountId(operatorAddress);
  // The payer and operator are always pinned; the filter only narrows further,
  // so it can never widen the query beyond this payer's own rails.
  const where: Record<string, string> = {
    payer: accountId,
    operator: operatorId,
  };
  if (filter.railId) {
    where.railId = filter.railId;
  }
  if (filter.payee) {
    where.payee = filter.payee.toLowerCase();
  }

  return useGraphQLQuery<AccountOperatorRailsResponse, ServiceRailsPage>({
    queryKey: ["account", accountId, "services", operatorId, "rails", page, where],
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
    enabled: !!accountId && !!operatorId,
    networkOverride: options?.networkOverride,
  });
};

type WithTokenId = { token: Pick<Token, "id"> };

export type ServiceOneTimePayment = Pick<OneTimePayment, "totalAmount"> & WithTokenId;

export interface ServiceMetricsResponse {
  /** Null when the payer has never been indexed. */
  account: {
    operatorApprovals: (Pick<OperatorApproval, "lockupUsage"> & { token: Pick<Token, "id" | "symbol" | "decimals"> })[];
    userTokens: (Pick<
      UserToken,
      "funds" | "lockupCurrent" | "lockupRate" | "lockupLastSettledUntilEpoch" | "lockupLastSettledUntilTimestamp"
    > &
      WithTokenId)[];
  } | null;
  /** Only the pair's paying `ACTIVE` rails. */
  rails: (Pick<Rail, "paymentRate" | "lockupPeriod"> & WithTokenId)[];
  /** The first page of this pair's payments since `monthStart`. A full page means more are unread. */
  oneTimePayments: ServiceOneTimePayment[];
}

/** The service metrics table's per-token figures, in one request and so from one block. */
export const useAccountServiceMetrics = (
  address: string,
  operatorAddress: string,
  /** Unix seconds. */
  monthStart: bigint,
  options?: AccountServicesOptions,
) => {
  const accountId = toAccountId(address);
  const operatorId = toAccountId(operatorAddress);

  return useGraphQLQuery<ServiceMetricsResponse>({
    queryKey: ["account", accountId, "services", operatorId, "metrics", monthStart.toString()],
    query: GET_SERVICE_METRICS,
    variables: {
      accountId,
      payer: accountId,
      operator: operatorId,
      monthStart: monthStart.toString(),
      first: SUBGRAPH_PAGE_SIZE,
    },
    enabled: !!accountId && !!operatorId,
    networkOverride: options?.networkOverride,
  });
};

type PagedServiceOneTimePayment = Pick<OneTimePayment, "id"> & ServiceOneTimePayment;

const SERVICE_ONE_TIME_PAYMENTS_MAX_PAGES = 10;

// A busy pair's walk is about ten requests, so tab focus should not repeat it. Transactions still invalidate it.
const SERVICE_ONE_TIME_PAYMENTS_STALE_MS = 5 * 60 * 1_000;

/**
 * Every payment of a pair whose payments overflow the metrics query's page. Busy pairs make thousands a month.
 * Bounded: `reachedPageLimit` says `items` is an arbitrary subset.
 */
export const useAccountServiceOneTimePayments = (
  address: string,
  operatorAddress: string,
  /** Unix seconds. */
  monthStart: bigint,
  options: AccountServicesOptions & { enabled: boolean },
) => {
  const accountId = toAccountId(address);
  const operatorId = toAccountId(operatorAddress);
  const { executeQuery, network } = useGraphQLClient({ networkOverride: options.networkOverride });

  return useQuery({
    queryKey: ["account", accountId, "services", operatorId, "one-time-payments", monthStart.toString(), network],
    queryFn: async ({ signal }) => {
      // Payment ids carry no order in time, so one written mid-walk could land below the cursor unless the block is fixed.
      const { block } = await fetchSubgraphMeta(executeQuery, signal);

      return fetchAllPages<PagedServiceOneTimePayment>(async (cursor) => {
        const page = await executeQuery<{ oneTimePayments: PagedServiceOneTimePayment[] }>(
          GET_SERVICE_ONE_TIME_PAYMENTS,
          {
            payer: accountId,
            operator: operatorId,
            monthStart: monthStart.toString(),
            first: SUBGRAPH_PAGE_SIZE,
            cursor,
            block: block.number,
          },
          signal,
        );
        return page.oneTimePayments;
      }, SERVICE_ONE_TIME_PAYMENTS_MAX_PAGES);
    },
    enabled: options.enabled && !!accountId && !!operatorId,
    staleTime: SERVICE_ONE_TIME_PAYMENTS_STALE_MS,
  });
};
