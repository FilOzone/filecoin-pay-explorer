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
  query GetAccountsLeaderboard($first: Int = 10, $token: String!) {
    topEarners: userTokens(orderBy: fundsCollected, orderDirection: desc, first: $first, where: { token: $token }) {
      fundsCollected
      account {
        id
        address
        totalRails
      }
      token {
        symbol
        decimals
      }
    }
    topSpenders: userTokens(orderBy: payout, orderDirection: desc, first: $first, where: { token: $token }) {
      payout
      account {
        id
        address
        totalRails
      }
      token {
        symbol
        decimals
      }
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
export const GET_APPROVED_OPERATOR_CLIENTS = gql`
  query GetApprovedOperatorClients($first: Int = 1000, $cursor: Bytes! = "0x") {
    operatorApprovals(first: $first, orderBy: id, orderDirection: asc, where: { isApproved: true, id_gt: $cursor }) {
      id
      client {
        id
      }
      operator {
        address
      }
    }
  }
`;

export const GET_OPERATORS_LEADERBOARD = gql`
  query GetOperatorsByUSDFCSettledAmount($first: Int = 10, $token: String) {
    operatorTokens(first: $first, orderBy: settledAmount, where: { token: $token }, orderDirection: desc) {
      settledAmount
      operator {
        id
        address
        totalRails
        totalTokens
        totalApprovals
      }
      token {
        decimals
        symbol
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
      totalOneTimePaymentAmount
      totalSettledAmount
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
    $token: String!
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
      userTokens(where: { token: $token }) {
        payout
        fundsCollected
        token {
          id
          symbol
          decimals
        }
      }
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
    $token: String!
  ) {
    operators(first: $first, skip: $skip, where: $where, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
      operatorTokens(where: { token: $token }) {
        settledAmount
        token {
          id
          decimals
          symbol
        }
      }
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
      validator
      commissionRateBps
      serviceFeeRecipient
      totalOneTimePaymentAmount
      totalSettledAmount
      totalOneTimePayments
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
      createdAt
      totalSettledAmount
      totalNetPayeeAmount
      # filBurned
      networkFee
      operatorCommission
      settledUpto
      token {
        decimals
        symbol
      }
    }
  }
`;

export const GET_RAIL_ONE_TIME_PAYMENTS = gql`
  query GetRailOneTimePayments($railId: Bytes!, $first: Int!, $skip: Int!) {
    oneTimePayments(where: { rail: $railId }, first: $first, skip: $skip, orderBy: blockNumber, orderDirection: desc) {
      id
      createdAt
      totalAmount
      netPayeeAmount
      networkFee
      operatorCommission
      blockNumber
      token {
        decimals
        symbol
      }
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
      rail {
        token {
          decimals
          symbol
        }
      }
    }
  }
`;

export const CHECK_ADDRESS = gql`
  query CheckAddress($address: Bytes!) {
    accounts(first: 5, where: { address_contains: $address }) {
      id
      address
      totalRails
      totalTokens
      totalApprovals
    }
    # TODO: Enable when operator page is ready
    # operators(first: 5, where: { address_contains: $address }) {
    #   id
    #   address
    #   totalRails
    #   totalTokens
    #   totalApprovals
    # }
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

export const GET_ACCOUNT_TOKEN = gql`
  query GetAccountToken($accountId: Bytes!, $tokenId: Bytes!) {
    userTokens(where: { account: $accountId, token: $tokenId }, first: 1) {
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
      totalOneTimePaymentAmount
      lockupPeriod
      settledUpto
      endEpoch
      # If the latest positive-rate segment is settled, every older segment is settled too.
      rateChangeQueue(first: 1, where: { rate_gt: 0 }, orderBy: untilEpoch, orderDirection: desc) {
        rate
        untilEpoch
      }
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

export const GET_STATS_DASHBOARD = gql`
  query GetStatsDashboard {
    tokens(orderBy: symbol, orderDirection: desc) {
      id
      name
      symbol
      decimals
      totalOneTimePayment
      totalSettledAmount
      userFunds
      lockupCurrent
      lockupRate
      lockupLastSettledUntilEpoch
    }
    paymentsMetrics(first: 1) {
      id
      totalRails
      totalAccounts
      totalFilBurned
      totalRailSettlements
      totalZeroRateRails
      totalActiveRails
      totalTerminatedRails
      totalFinalizedRails
    }
  }
`;

/**
 * The three reads behind the spend chart: one for the block to pin to, then two
 * cursor-paged collections that integrate into monthly totals.
 *
 * The epoch the history is read at. Every page below pins to it, so a walk
 * spanning many requests sees one immutable snapshot rather than a moving target.
 */
export const GET_SUBGRAPH_BLOCK = gql`
  query GetSubgraphBlock {
    _meta {
      block {
        number
      }
    }
  }
`;

export const GET_ACCOUNT_RATE_PERIODS = gql`
  query GetAccountRatePeriods(
    $accountId: Bytes!
    $tokenId: Bytes!
    $windowStartEpoch: BigInt!
    $first: Int!
    $cursor: Bytes!
    $block: Int!
  ) {
    # The rate timeline, not the settlement work queue. Every period a rail
    # charged at is recorded, so nothing has to be reconstructed. An open period
    # has a null untilEpoch.
    #
    # Pinned to $block. Cursor paging needs a fixed snapshot to be sound: ids are
    # transaction hash plus log index, so an entity written mid-walk can land
    # below the cursor and never be returned.
    #
    # Two branches because a comparison filter never matches null: the first
    # keeps periods still running, the second those that ended inside the charted
    # range. Without this the newest page of a busy account covers hours, and
    # every month before it renders as zero.
    #
    # rate_gt: 0 because a rail opens a zero-rate period at creation that runs
    # until it is activated. Those contribute nothing and, on a real account,
    # outnumber the periods that do.
    #
    # untilEpoch_gt, not _gte: a period ending exactly at the window's
    # exclusive start has no overlap with it.
    #
    # Ordered by id, not startEpoch, because id is the pagination cursor and has
    # to be unique — many periods share a start epoch.
    railRatePeriods(
      block: { number: $block }
      where: {
        or: [
          { payer: $accountId, token: $tokenId, rate_gt: "0", untilEpoch: null, id_gt: $cursor }
          { payer: $accountId, token: $tokenId, rate_gt: "0", untilEpoch_gt: $windowStartEpoch, id_gt: $cursor }
        ]
      }
      first: $first
      orderBy: id
      orderDirection: asc
    ) {
      id
      rate
      startEpoch
      untilEpoch
      operator {
        address
      }
    }
  }
`;

export const GET_ACCOUNT_ONE_TIME_PAYMENTS = gql`
  query GetAccountOneTimePayments(
    $accountId: Bytes!
    $tokenId: Bytes!
    $windowStartTimestamp: BigInt!
    $first: Int!
    $cursor: Bytes!
    $block: Int!
  ) {
    # A payment is a point in time, so a single lower bound is enough — no null
    # case to fold in, unlike the rate periods above. Pinned to the same block,
    # so a payment landing mid-walk cannot appear against streaming totals that
    # stop earlier.
    oneTimePayments(
      block: { number: $block }
      where: { payer: $accountId, token: $tokenId, createdAt_gte: $windowStartTimestamp, id_gt: $cursor }
      first: $first
      orderBy: id
      orderDirection: asc
    ) {
      id
      totalAmount
      createdAt
      operator {
        address
      }
    }
  }
`;
