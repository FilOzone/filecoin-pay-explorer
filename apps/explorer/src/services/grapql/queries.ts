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
      totalRailSettlements
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

export const GET_ACCOUNTS_LEADERBOARD = gql`
  query GetAccountsLeaderboard($first: Int = 10, $orderBy: Account_orderBy = totalRails) {
    accounts(first: $first, orderBy: $orderBy, orderDirection: desc) {
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

export const GET_OPERATORS_LEADERBOARD = gql`
  query GetOperatorsLeaderboard($first: Int = 10, $orderBy: Operator_orderBy = totalRails) {
    operators(first: $first, orderBy: $orderBy, orderDirection: desc) {
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
  query GetRailsPaginated(
    $first: Int!
    $skip: Int!
    $where: Rail_filter
    $orderBy: Rail_orderBy
    $orderDirection: OrderDirection
  ) {
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
  query GetAccountsPaginated(
    $first: Int!
    $skip: Int!
    $where: Account_filter
    $orderBy: Account_orderBy
    $orderDirection: OrderDirection
  ) {
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
  query GetOperatorsPaginated(
    $first: Int!
    $skip: Int!
    $where: Operator_filter
    $orderBy: Operator_orderBy
    $orderDirection: OrderDirection
  ) {
    operators(first: $first, skip: $skip, where: $where, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
  }
`;

// Individual entity queries

export const GET_RAIL_DETAILS = gql`
  query GetRailDetails($railId: BigInt!) {
    rails(where: { railId: $railId }) {
      id
      railId
      paymentRate
      lockupFixed
      lockupPeriod
      settledUpto
      state
      endEpoch
      arbiter
      commissionRateBps
      serviceFeeRecipient
      totalSettledAmount
      totalNetPayeeAmount
      totalCommission
      totalSettlements
      totalRateChanges
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
        name
        symbol
        decimals
      }
    }
  }
`;

export const GET_RAIL_SETTLEMENTS = gql`
  query GetRailSettlements($railId: Bytes!, $first: Int!, $skip: Int!) {
    settlements(where: { rail: $railId }, first: $first, skip: $skip, orderBy: settledUpto, orderDirection: desc) {
      id
      totalSettledAmount
      totalNetPayeeAmount
      filBurned
      operatorCommission
      settledUpto
    }
  }
`;

export const GET_RAIL_RATE_CHANGES = gql`
  query GetRailRateChanges($railId: Bytes!, $first: Int!, $skip: Int!) {
    rateChangeQueues(where: { rail: $railId }, first: $first, skip: $skip, orderBy: startEpoch, orderDirection: asc) {
      id
      startEpoch
      untilEpoch
      rate
    }
  }
`;

// Operator detail queries

export const GET_OPERATOR_DETAILS = gql`
  query GetOperatorDetails($address: Bytes!) {
    operators(where: { address: $address }) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
  }
`;

export const GET_OPERATOR_TOKENS = gql`
  query GetOperatorTokens($operatorId: Bytes!, $first: Int!, $skip: Int!) {
    operatorTokens(
      where: { operator: $operatorId }
      first: $first
      skip: $skip
      orderBy: volume
      orderDirection: desc
    ) {
      id
      commissionEarned
      volume
      lockupAllowance
      rateAllowance
      lockupUsage
      rateUsage
      settledAmount
      token {
        id
        name
        symbol
        decimals
      }
    }
  }
`;

export const GET_OPERATOR_RAILS = gql`
  query GetOperatorRails($operatorId: Bytes!, $first: Int!, $skip: Int!) {
    rails(where: { operator: $operatorId }, first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
      id
      railId
      state
      paymentRate
      totalSettledAmount
      createdAt
      payer {
        id
        address
      }
      payee {
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

export const GET_OPERATOR_APPROVALS = gql`
  query GetOperatorApprovals($operatorId: Bytes!, $first: Int!, $skip: Int!) {
    operatorApprovals(
      where: { operator: $operatorId }
      first: $first
      skip: $skip
      orderBy: rateUsage
      orderDirection: desc
    ) {
      id
      isApproved
      maxLockupPeriod
      lockupAllowance
      rateAllowance
      lockupUsage
      rateUsage
      client {
        id
        address
      }
      token {
        id
        name
        symbol
        decimals
      }
    }
  }
`;

// Account detail queries

export const GET_ACCOUNT_DETAILS = gql`
  query GetAccountDetails($address: Bytes!) {
    accounts(where: { address: $address }) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
  }
`;

export const GET_ACCOUNT_TOKENS = gql`
  query GetAccountTokens($accountId: Bytes!, $first: Int!, $skip: Int!) {
    userTokens(where: { account: $accountId }, first: $first, skip: $skip, orderBy: funds, orderDirection: desc) {
      id
      funds
      lockupCurrent
      lockupRate
      lockupLastSettledUntilEpoch
      lockupLastSettledUntilTimestamp
      payout
      fundsCollected
      token {
        id
        name
        symbol
        decimals
      }
    }
  }
`;

export const GET_ACCOUNT_RAILS = gql`
  query GetAccountRails($accountId: Bytes!, $first: Int!, $skip: Int!) {
    rails(
      where: { or: [{ payer: $accountId }, { payee: $accountId }] }
      first: $first
      skip: $skip
      orderBy: createdAt
      orderDirection: desc
    ) {
      id
      railId
      state
      paymentRate
      totalSettledAmount
      lockupPeriod
      settledUpto
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

export const GET_ACCOUNT_APPROVALS = gql`
  query GetAccountApprovals($accountId: Bytes!, $first: Int!, $skip: Int!) {
    operatorApprovals(
      where: { client: $accountId }
      first: $first
      skip: $skip
      orderBy: rateUsage
      orderDirection: desc
    ) {
      id
      isApproved
      maxLockupPeriod
      lockupAllowance
      rateAllowance
      lockupUsage
      rateUsage
      operator {
        id
        address
      }
      token {
        id
        name
        symbol
        decimals
      }
    }
  }
`;

// Token Details Queries

export const GET_TOKEN_DETAILS = gql`
  query GetTokenDetails($id: Bytes!) {
    token(id: $id) {
      id
      name
      symbol
      decimals
      totalSettledAmount
      userFunds
      totalUsers
      totalFixedLockup
      totalStreamingLockup
    }
  }
`;
