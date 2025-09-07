import { Address, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { Rail } from "../../../generated/schema";
import { ONE_BIG_INT, ZERO_BIG_INT } from "./constants";
import { MetricsEntityManager } from "./core";

// Base collector interface for consistency
export abstract class BaseMetricsCollector {
  protected timestamp: GraphBN;
  protected blockNumber: GraphBN;

  constructor(timestamp: GraphBN, blockNumber: GraphBN) {
    this.timestamp = timestamp;
    this.blockNumber = blockNumber;
  }

  abstract collect(): void;
}

// Rail Creation Metrics Collector
export class RailCreationCollector extends BaseMetricsCollector {
  private rail: Rail;
  private newAccounts: GraphBN;
  private isNewPayer: boolean;
  private isNewPayee: boolean;
  private isNewOperator: boolean;

  constructor(
    rail: Rail,
    newAccounts: GraphBN,
    isNewPayer: boolean,
    isNewPayee: boolean,
    isNewOperator: boolean,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ) {
    super(timestamp, blockNumber);
    this.rail = rail;
    this.newAccounts = newAccounts;
    this.isNewPayer = isNewPayer;
    this.isNewPayee = isNewPayee;
    this.isNewOperator = isNewOperator;
  }

  collect(): void {
    this.updateDailyMetrics();
    this.updateWeeklyMetrics();
    this.updateTokenMetrics();
    this.updateOperatorMetrics();
    this.updateNetworkMetrics();
  }

  private updateDailyMetrics(): void {
    const dailyMetric = MetricsEntityManager.loadOrCreateDailyMetric(this.timestamp);

    dailyMetric.railsCreated = dailyMetric.railsCreated.plus(ONE_BIG_INT);

    dailyMetric.newAccounts = dailyMetric.newAccounts.plus(this.newAccounts);

    // Update unique counts (simplified - in production you'd track sets)
    dailyMetric.uniquePayers = dailyMetric.uniquePayers.plus(this.isNewPayer ? ONE_BIG_INT : ZERO_BIG_INT);
    dailyMetric.uniquePayees = dailyMetric.uniquePayees.plus(this.isNewPayee ? ONE_BIG_INT : ZERO_BIG_INT);
    dailyMetric.uniqueOperators = dailyMetric.uniqueOperators.plus(this.isNewOperator ? ONE_BIG_INT : ZERO_BIG_INT);

    dailyMetric.save();
  }

  private updateWeeklyMetrics(): void {
    const weeklyMetric = MetricsEntityManager.loadOrCreateWeeklyMetric(this.timestamp);

    weeklyMetric.railsCreated = weeklyMetric.railsCreated.plus(ONE_BIG_INT);

    weeklyMetric.newAccounts = weeklyMetric.newAccounts.plus(this.newAccounts);

    // Update unique counts (simplified - in production you'd track sets)
    weeklyMetric.uniquePayers = weeklyMetric.uniquePayers.plus(this.isNewPayer ? ONE_BIG_INT : ZERO_BIG_INT);
    weeklyMetric.uniquePayees = weeklyMetric.uniquePayees.plus(this.isNewPayee ? ONE_BIG_INT : ZERO_BIG_INT);
    weeklyMetric.uniqueOperators = weeklyMetric.uniqueOperators.plus(this.isNewOperator ? ONE_BIG_INT : ZERO_BIG_INT);

    weeklyMetric.save();
  }

  private updateTokenMetrics(): void {
    const tokenMetric = MetricsEntityManager.loadOrCreateTokenMetric(
      Address.fromBytes(this.rail.token),
      this.timestamp,
    );

    tokenMetric.activeRailsCount = tokenMetric.activeRailsCount.plus(ONE_BIG_INT);

    tokenMetric.save();
  }

  private updateOperatorMetrics(): void {
    const operatorMetric = MetricsEntityManager.loadOrCreateOperatorMetric(
      Address.fromBytes(this.rail.operator),
      this.timestamp,
    );

    operatorMetric.railsCreated = operatorMetric.railsCreated.plus(ONE_BIG_INT);

    const uniqueClients = (this.isNewPayee ? 1 : 0) + (this.isNewPayer ? 1 : 0);
    operatorMetric.uniqueClients = operatorMetric.uniqueClients.plus(GraphBN.fromI32(uniqueClients));

    operatorMetric.save();
  }

  private updateNetworkMetrics(): void {
    const networkMetric = MetricsEntityManager.loadOrCreatePaymentsMetric();

    networkMetric.totalRails = networkMetric.totalRails.plus(ONE_BIG_INT);
    networkMetric.totalZeroRateRails = networkMetric.totalZeroRateRails.plus(ONE_BIG_INT);
    networkMetric.totalAccounts = networkMetric.totalAccounts.plus(this.newAccounts);

    if (this.isNewPayee) {
      networkMetric.uniquePayees = networkMetric.uniquePayees.plus(ONE_BIG_INT);
    }

    if (this.isNewPayer) {
      networkMetric.uniquePayers = networkMetric.uniquePayers.plus(ONE_BIG_INT);
    }

    networkMetric.save();
  }
}

// Settlement Metrics Collector
export class SettlementCollector extends BaseMetricsCollector {
  private rail: Rail;
  private totalSettledAmount: GraphBN;
  private totalNetPayeeAmount: GraphBN;
  private operatorCommission: GraphBN;
  private filBurned: GraphBN;

  constructor(
    rail: Rail,
    totalSettledAmount: GraphBN,
    totalNetPayeeAmount: GraphBN,
    operatorCommission: GraphBN,
    filBurned: GraphBN,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ) {
    super(timestamp, blockNumber);
    this.rail = rail;
    this.totalSettledAmount = totalSettledAmount;
    this.totalNetPayeeAmount = totalNetPayeeAmount;
    this.operatorCommission = operatorCommission;
    this.filBurned = filBurned;
  }

  collect(): void {
    this.updateVolumeMetrics();
    this.updateOperatorMetrics();
    this.updateTokenMetrics();
    this.updateNetworkMetrics();
  }

  private updateVolumeMetrics(): void {
    // Daily metrics
    const dailyMetric = MetricsEntityManager.loadOrCreateDailyMetric(this.timestamp);
    dailyMetric.totalRailSettlements = dailyMetric.totalRailSettlements.plus(ONE_BIG_INT);
    dailyMetric.filBurned = dailyMetric.filBurned.plus(this.filBurned);
    dailyMetric.save();

    // Weekly metrics
    const weeklyMetric = MetricsEntityManager.loadOrCreateWeeklyMetric(this.timestamp);
    weeklyMetric.totalRailSettlements = weeklyMetric.totalRailSettlements.plus(ONE_BIG_INT);
    weeklyMetric.filBurned = weeklyMetric.filBurned.plus(this.filBurned);
    weeklyMetric.save();
  }

  private updateOperatorMetrics(): void {
    const operatorMetric = MetricsEntityManager.loadOrCreateOperatorMetric(
      Address.fromBytes(this.rail.operator),
      this.timestamp,
    );

    operatorMetric.volume = operatorMetric.volume.plus(this.totalSettledAmount);
    operatorMetric.settledAmount = operatorMetric.settledAmount.plus(this.totalNetPayeeAmount);
    operatorMetric.commissionEarned = operatorMetric.commissionEarned.plus(this.operatorCommission);
    operatorMetric.settlementsProcessed = operatorMetric.settlementsProcessed.plus(ONE_BIG_INT);

    operatorMetric.save();
  }

  private updateTokenMetrics(): void {
    const tokenMetric = MetricsEntityManager.loadOrCreateTokenMetric(
      Address.fromBytes(this.rail.token),
      this.timestamp,
    );

    tokenMetric.volume = tokenMetric.volume.plus(this.totalSettledAmount);
    tokenMetric.settledAmount = tokenMetric.settledAmount.plus(this.totalNetPayeeAmount);
    tokenMetric.commissionPaid = tokenMetric.commissionPaid.plus(this.operatorCommission);

    tokenMetric.save();
  }

  private updateNetworkMetrics(): void {
    const networkMetric = MetricsEntityManager.loadOrCreatePaymentsMetric();

    networkMetric.totalFilBurned = networkMetric.totalFilBurned.plus(this.filBurned);

    networkMetric.save();
  }
}

// Rail State Change Collector
export class RailStateChangeCollector extends BaseMetricsCollector {
  private rail: Rail;
  private previousState: string;
  private newState: string;

  constructor(rail: Rail, previousState: string, newState: string, timestamp: GraphBN, blockNumber: GraphBN) {
    super(timestamp, blockNumber);
    this.rail = rail;
    this.previousState = previousState;
    this.newState = newState;
  }

  collect(): void {
    if (this.previousState === this.newState) return;
    this.updateDailyAndWeeklyStateMetrics();
    this.updateNetworkStateMetrics();
  }

  private updateDailyAndWeeklyStateMetrics(): void {
    const dailyMetric = MetricsEntityManager.loadOrCreateDailyMetric(this.timestamp);
    const weeklyMetric = MetricsEntityManager.loadOrCreateWeeklyMetric(this.timestamp);

    if (this.newState === "TERMINATED") {
      dailyMetric.railsTerminated = dailyMetric.railsTerminated.plus(ONE_BIG_INT);
      weeklyMetric.railsTerminated = weeklyMetric.railsTerminated.plus(ONE_BIG_INT);
    } else if (this.newState === "FINALIZED") {
      dailyMetric.railsFinalized = dailyMetric.railsFinalized.plus(ONE_BIG_INT);
      weeklyMetric.railsFinalized = weeklyMetric.railsFinalized.plus(ONE_BIG_INT);
    } else if (this.newState === "ACTIVE") {
      dailyMetric.activeRailsCount = dailyMetric.activeRailsCount.plus(ONE_BIG_INT);
      weeklyMetric.activeRailsCount = weeklyMetric.activeRailsCount.plus(ONE_BIG_INT);
    }

    dailyMetric.save();
    weeklyMetric.save();
  }

  private updateNetworkStateMetrics(): void {
    const networkMetric = MetricsEntityManager.loadOrCreatePaymentsMetric();

    if (this.newState === "TERMINATED") {
      networkMetric.totalTerminatedRails = networkMetric.totalTerminatedRails.plus(ONE_BIG_INT);
      networkMetric.totalActiveRails = networkMetric.totalActiveRails.minus(ONE_BIG_INT);
    } else if (this.newState === "FINALIZED") {
      networkMetric.totalFinalizedRails = networkMetric.totalFinalizedRails.plus(ONE_BIG_INT);
      networkMetric.totalTerminatedRails = networkMetric.totalTerminatedRails.minus(ONE_BIG_INT);
    } else if (this.newState === "ACTIVE" && this.previousState === "ZERORATE") {
      networkMetric.totalZeroRateRails = networkMetric.totalZeroRateRails.minus(ONE_BIG_INT);
      networkMetric.totalActiveRails = networkMetric.totalActiveRails.plus(ONE_BIG_INT);
    } else if (this.newState === "ZERORATE" && this.previousState === "") {
      // already updated in RailCreationCollector
    }

    networkMetric.save();
  }
}

// Token Activity Collector (for deposits/withdrawals)
export class TokenActivityCollector extends BaseMetricsCollector {
  private tokenAddress: Address;
  private accountAddress: Address;
  private amount: GraphBN;
  private isDeposit: boolean;
  private isNewAccount: boolean;
  private isNewToken: boolean;

  constructor(
    tokenAddress: Address,
    accountAddress: Address,
    amount: GraphBN,
    isDeposit: boolean,
    isNewAccount: boolean,
    isNewToken: boolean,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ) {
    super(timestamp, blockNumber);
    this.tokenAddress = tokenAddress;
    this.accountAddress = accountAddress;
    this.amount = amount;
    this.isDeposit = isDeposit;
    this.isNewAccount = isNewAccount;
    this.isNewToken = isNewToken;
  }

  collect(): void {
    this.updateTokenMetrics();
    this.updateNetworkMetrics();
  }

  private updateTokenMetrics(): void {
    const tokenMetric = MetricsEntityManager.loadOrCreateTokenMetric(this.tokenAddress, this.timestamp);
    tokenMetric.volume = tokenMetric.volume.plus(this.amount);

    if (this.isDeposit) {
      tokenMetric.deposit = tokenMetric.deposit.plus(this.amount);
    } else {
      tokenMetric.withdrawal = tokenMetric.withdrawal.plus(this.amount);
    }

    if (this.isNewAccount) {
      tokenMetric.uniqueHolders = tokenMetric.uniqueHolders.plus(ONE_BIG_INT);
    }

    tokenMetric.save();
  }

  private updateNetworkMetrics(): void {
    const networkMetric = MetricsEntityManager.loadOrCreatePaymentsMetric();
    if (this.isNewAccount) {
      networkMetric.totalAccounts = networkMetric.totalAccounts.plus(ONE_BIG_INT);
    }

    if (this.isNewToken) {
      networkMetric.totalTokens = networkMetric.totalTokens.plus(ONE_BIG_INT);
    }

    networkMetric.save();
  }
}

// Operator Approval Collector
export class OperatorApprovalCollector extends BaseMetricsCollector {
  private operatorAddress: Address;
  private clientAddress: Address;
  private isNewApproval: boolean;
  private isNewOperator: boolean;

  constructor(
    operatorAddress: Address,
    clientAddress: Address,
    isNewApproval: boolean,
    isNewOperator: boolean,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ) {
    super(timestamp, blockNumber);
    this.operatorAddress = operatorAddress;
    this.clientAddress = clientAddress;
    this.isNewApproval = isNewApproval;
    this.isNewOperator = isNewOperator;
  }

  collect(): void {
    this.updateOperatorMetrics();
    this.updateNetworkMetrics();
  }

  private updateOperatorMetrics(): void {
    const operatorMetric = MetricsEntityManager.loadOrCreateOperatorMetric(this.operatorAddress, this.timestamp);

    if (this.isNewApproval) {
      operatorMetric.totalApprovals = operatorMetric.totalApprovals.plus(ONE_BIG_INT);
      operatorMetric.save();
    }
  }

  private updateNetworkMetrics(): void {
    if (this.isNewOperator) {
      const networkMetric = MetricsEntityManager.loadOrCreatePaymentsMetric();
      networkMetric.totalOperators = networkMetric.totalOperators.plus(ONE_BIG_INT);
      networkMetric.save();
    }
  }
}

// Metrics Collection Orchestrator
export class MetricsCollectionOrchestrator {
  static collectRailCreationMetrics(
    rail: Rail,
    newAccounts: GraphBN,
    isNewPayer: boolean,
    isNewPayee: boolean,
    isNewOperator: boolean,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ): void {
    const collector = new RailCreationCollector(
      rail,
      newAccounts,
      isNewPayer,
      isNewPayee,
      isNewOperator,
      timestamp,
      blockNumber,
    );
    collector.collect();
  }

  static collectSettlementMetrics(
    rail: Rail,
    totalSettledAmount: GraphBN,
    totalNetPayeeAmount: GraphBN,
    operatorCommission: GraphBN,
    paymentFees: GraphBN,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ): void {
    const collector = new SettlementCollector(
      rail,
      totalSettledAmount,
      totalNetPayeeAmount,
      operatorCommission,
      paymentFees,
      timestamp,
      blockNumber,
    );
    collector.collect();
  }

  static collectRailStateChangeMetrics(
    rail: Rail,
    previousState: string,
    newState: string,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ): void {
    const collector = new RailStateChangeCollector(rail, previousState, newState, timestamp, blockNumber);
    collector.collect();
  }

  static collectTokenActivityMetrics(
    tokenAddress: Address,
    accountAddress: Address,
    amount: GraphBN,
    isDeposit: boolean,
    isNewAccount: boolean,
    isNewToken: boolean,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ): void {
    const collector = new TokenActivityCollector(
      tokenAddress,
      accountAddress,
      amount,
      isDeposit,
      isNewAccount,
      isNewToken,
      timestamp,
      blockNumber,
    );
    collector.collect();
  }

  static collectOperatorApprovalMetrics(
    operatorAddress: Address,
    clientAddress: Address,
    isNewApproval: boolean,
    isNewOperator: boolean,
    timestamp: GraphBN,
    blockNumber: GraphBN,
  ): void {
    const collector = new OperatorApprovalCollector(
      operatorAddress,
      clientAddress,
      isNewApproval,
      isNewOperator,
      timestamp,
      blockNumber,
    );
    collector.collect();
  }
}
