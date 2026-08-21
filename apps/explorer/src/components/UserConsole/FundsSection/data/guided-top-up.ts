import type { QueryClient } from "@tanstack/react-query";
import { parseFundingAmount, USDFC_DECIMALS } from "./funding-runway";

export function parseTopUpAmount(amount: string): bigint | null {
  return parseFundingAmount(amount, USDFC_DECIMALS);
}

export function withoutTopUpSearchParam(searchParams: URLSearchParams): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("topUp");
  const query = nextSearchParams.toString();
  return query ? `?${query}` : "";
}

export type ConsoleView = "disconnected" | "pending" | "filecoin" | "unsupported";

/**
 * The console body to render. While the guided top-up dialog is open and the
 * wallet is parked on a Squid source chain (a required, temporary state for
 * signing the acquisition), the Filecoin console stays visible behind the
 * dialog instead of flipping to the unsupported-network takeover; account
 * data is subgraph-sourced, so it does not depend on the wallet's chain.
 */
export function consoleDisplayView(view: ConsoleView, isSquidSourceChain: boolean, topUpOpen: boolean): ConsoleView {
  return view === "unsupported" && isSquidSourceChain && topUpOpen ? "filecoin" : view;
}

export function invalidateTopUpQueries(queryClient: QueryClient, accountId: string, accountOwner: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["account", accountOwner] }),
    queryClient.invalidateQueries({ queryKey: ["account", accountId, "tokens"] }),
    queryClient.invalidateQueries({ queryKey: ["payments", "account-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["balance"] }),
    queryClient.invalidateQueries({ queryKey: ["readContract"] }),
  ]);
}
