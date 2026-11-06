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
import { fetchAllPages, SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import { toAccountId } from "@/utils/hexUtils";
import { useGraphQLClient, useGraphQLInfiniteQuery, useGraphQLQuery } from "./useGraphQLQuery";
import useNetwork from "./useNetwork";

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

type TokenId = { token: Pick<Token, "id"> };

export interface ServiceMetricsResponse {
  /** Null when the payer has never been indexed. */
  account: {
    operatorApprovals: (Pick<OperatorApproval, "lockupUsage"> & { token: Pick<Token, "id" | "symbol" | "decimals"> })[];
    userTokens: (Pick<
      UserToken,
      "funds" | "lockupCurrent" | "lockupRate" | "lockupLastSettledUntilEpoch" | "lockupLastSettledUntilTimestamp"
    > &
      TokenId)[];
  } | null;
  /** Only the pair's paying `ACTIVE` rails. */
  rails: (Pick<Rail, "paymentRate" | "lockupPeriod"> & TokenId)[];
  /** Only this pair's payments since `monthStart`. */
  oneTimePayments: (Pick<OneTimePayment, "totalAmount"> & TokenId)[];
}

export type ServiceMetrics = ServiceMetricsResponse & {
  /** Payments were left unread, so `oneTimePayments` is an arbitrary subset. */
  oneTimePaymentsReachedLimit: boolean;
};

/** Pages the same as the spend chart's history, so both give up at the same point. */
const SERVICE_ONE_TIME_PAYMENTS_MAX_PAGES = 10;

/** Everything the service metrics table reads, in one request unless the pair's one-time payments overflow a page. */
export const useAccountServiceMetrics = (
  address: string,
  operatorAddress: string,
  /** Unix seconds. */
  monthStart: bigint,
  options?: AccountServicesOptions,
) => {
  const accountId = toAccountId(address);
  const operatorId = toAccountId(operatorAddress);
  const { network: contextNetwork } = useNetwork();
  const network = options?.networkOverride ?? contextNetwork;
  const { executeQuery } = useGraphQLClient({ networkOverride: options?.networkOverride });

  return useQuery<ServiceMetrics>({
    queryKey: ["account", accountId, "services", operatorId, "metrics", monthStart.toString(), network],
    queryFn: async ({ signal }) => {
      const pairMonth = {
        payer: accountId,
        operator: operatorId,
        monthStart: monthStart.toString(),
        first: SUBGRAPH_PAGE_SIZE,
      };
      const metrics = await executeQuery<ServiceMetricsResponse>(
        GET_SERVICE_METRICS,
        { accountId, ...pairMonth },
        signal,
      );
      if (metrics.oneTimePayments.length < SUBGRAPH_PAGE_SIZE) {
        return { ...metrics, oneTimePaymentsReachedLimit: false };
      }

      // Busy pairs make thousands of these a month. Restarting from the first page costs them one extra read.
      const { items, reachedPageLimit } = await fetchAllPages<
        Pick<OneTimePayment, "id"> & ServiceMetricsResponse["oneTimePayments"][number]
      >(async (cursor) => {
        const page = await executeQuery<{
          oneTimePayments: (Pick<OneTimePayment, "id"> & ServiceMetricsResponse["oneTimePayments"][number])[];
        }>(GET_SERVICE_ONE_TIME_PAYMENTS, { ...pairMonth, cursor }, signal);
        return page.oneTimePayments;
      }, SERVICE_ONE_TIME_PAYMENTS_MAX_PAGES);

      return { ...metrics, oneTimePayments: items, oneTimePaymentsReachedLimit: reachedPageLimit };
    },
    enabled: !!accountId && !!operatorId,
  });
};
