import { BigInt as GraphBN } from "@graphprotocol/graph-ts";

// Time constants
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_WEEK = 604800;

// GraphQL BigInt constants
export const ZERO_BIG_INT = GraphBN.zero();
export const ONE_BIG_INT = GraphBN.fromI32(1);
export const HUNDRED_BIG_INT = GraphBN.fromI32(100);
export const BASIS_POINTS_DIVISOR = GraphBN.fromI32(10000);

// Metrics entity IDs
export const PAYMENTS_NETWORK_STATS_ID = "payments_network_stats";

// Date format helpers
export class DateHelpers {
  static getDateString(timestamp: i64): string {
    const date = new Date(timestamp * 1_000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();

    const monthStr = month < 10 ? "0" + month.toString() : month.toString();
    const dayStr = day < 10 ? "0" + day.toString() : day.toString();

    return year.toString() + "-" + monthStr + "-" + dayStr;
  }

  static getWeek(timestamp: i64): GraphBN {
    const week = ((timestamp / SECONDS_PER_WEEK) as i32) + 1;
    return GraphBN.fromI32(week);
  }

  static getMonthString(timestamp: i64): string {
    const date = new Date(timestamp * 1_000);
    const month = date.getUTCMonth() + 1;
    const monthStr = month < 10 ? "0" + month.toString() : month.toString();
    const year = date.getUTCFullYear();
    return year.toString() + "-" + monthStr;
  }

  static getDayStartTimestamp(timestamp: i64): i64 {
    return timestamp - (timestamp % SECONDS_PER_DAY);
  }

  static getWeekStartTimestamp(timestamp: i64): i64 {
    return timestamp - (timestamp % SECONDS_PER_WEEK);
  }
}
