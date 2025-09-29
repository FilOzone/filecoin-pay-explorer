export interface PaymentsMetric {
  id: string;
  totalRails: bigint;
  totalOperators: bigint;
  totalTokens: bigint;
  totalAccounts: bigint;
  totalFilBurned: bigint;
  totalZeroRateRails: bigint;
  totalActiveRails: bigint;
  totalTerminatedRails: bigint;
  totalFinalizedRails: bigint;
  uniquePayers: bigint;
  uniquePayees: bigint;
}

export interface DailyMetric {
  id: string;
  timestamp: bigint;
  date: string;
  filBurned: bigint;
  railsCreated: bigint;
  totalRailSettlements: bigint;
  railsTerminated: bigint;
  railsFinalized: bigint;
  activeRailsCount: bigint;
  uniquePayers: bigint;
  uniquePayees: bigint;
  uniqueOperators: bigint;
  uniqueAccounts: bigint;
}

export interface WeeklyMetric {
  id: string;
  timestamp: bigint;
  week: bigint;
  filBurned: bigint;
  railsCreated: bigint;
  totalRailSettlements: bigint;
  railsTerminated: bigint;
  railsFinalized: bigint;
  activeRailsCount: bigint;
  uniquePayers: bigint;
  uniquePayees: bigint;
  uniqueOperators: bigint;
  uniqueAccounts: bigint;
}

export interface Token {
  id: string;
  name: string;
  symbol: string;
  decimals: bigint;
  volume: bigint;
  totalDeposits: bigint;
  totalWithdrawals: bigint;
  totalSettledAmount: bigint;
  userFunds: bigint;
  operatorCommission: bigint;
}

export interface TokenMetric {
  id: string;
  token: {
    id: string;
    name: string;
    symbol: string;
    decimals: bigint;
  };
  timestamp: bigint;
  date?: string;
  week?: bigint;
  volume: bigint;
  deposit: bigint;
  withdrawal: bigint;
  settledAmount: bigint;
  commissionPaid: bigint;
  activeRailsCount: bigint;
  uniqueHolders: bigint;
  totalLocked: bigint;
}

export interface Operator {
  id: string;
  address: string;
  totalRails: bigint;
  totalTokens: bigint;
  totalApprovals: bigint;
}

export interface OperatorToken {
  id: string;
  commissionEarned: bigint;
  volume: bigint;
  settledAmount: bigint;
  operator: Operator;
  token: Token;
}

export interface OperatorMetric {
  id: string;
  operator: {
    id: string;
    address: string;
  };
  timestamp: bigint;
  date?: string;
  week?: bigint;
  railsCreated: bigint;
  settlementsProcessed: bigint;
  uniqueClients: bigint;
  totalApprovals: bigint;
}
