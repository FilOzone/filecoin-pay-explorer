import { gql } from "graphql-request";

export const GET_PAYMENTS_METRICS = gql`
  query GetPaymentsMetrics {
    paymentsMetrics(first: 1) {
      id
      totalRails
      totalOperators
      totalTokens
      totalAccounts
      totalFilBurned
      totalZeroRateRails
      totalActiveRails
      totalTerminatedRails
      totalFinalizedRails
      uniquePayers
      uniquePayees
    }
  }
`;

export const GET_RECENT_ACCOUNTS = gql`
  query GetRecentAccounts($first: Int = 10) {
    accounts(first: $first, orderBy: id, orderDirection: desc) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
  }
`;

export const GET_RECENT_OPERATORS = gql`
  query GetRecentOperators($first: Int = 10) {
    operators(first: $first, orderBy: id, orderDirection: desc) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
  }
`;

export const GET_RECENT_RAILS = gql`
  query GetRecentRails($first: Int = 10) {
    rails(first: $first, orderBy: createdAt, orderDirection: desc) {
      id
      railId
      state
      paymentRate
      totalSettledAmount
      createdAt
      payer {
        address
      }
      payee {
        address
      }
      token {
        symbol
        decimals
      }
    }
  }
`;

// Paginated queries with search filters

export const GET_RAILS_PAGINATED = gql`
  query GetRailsPaginated($first: Int!, $skip: Int!, $where: Rail_filter, $orderBy: Rail_orderBy, $orderDirection: OrderDirection) {
    rails(first: $first, skip: $skip, where: $where, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      railId
      state
      paymentRate
      totalSettledAmount
      totalSettlements
      createdAt
      payer {
        id
        address
      }
      payee {
        id
        address
      }
      operator {
        id
        address
      }
      token {
        id
        symbol
        decimals
      }
    }
  }
`;

export const GET_ACCOUNTS_PAGINATED = gql`
  query GetAccountsPaginated($first: Int!, $skip: Int!, $where: Account_filter, $orderBy: Account_orderBy, $orderDirection: OrderDirection) {
    accounts(first: $first, skip: $skip, where: $where, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
  }
`;

export const GET_OPERATORS_PAGINATED = gql`
  query GetOperatorsPaginated($first: Int!, $skip: Int!, $where: Operator_filter, $orderBy: Operator_orderBy, $orderDirection: OrderDirection) {
    operators(first: $first, skip: $skip, where: $where, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
  }
`;
