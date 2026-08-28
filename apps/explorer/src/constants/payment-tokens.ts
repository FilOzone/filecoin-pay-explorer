import { calibration, mainnet } from "@/constants/chains";

export interface PaymentTokenOption {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}

// Curated payment tokens shown by symbol in the Add Service dialog so users
// never have to paste a token address. Both support EIP-2612 permits, which
// the combined deposit-and-approve flow relies on.
//
// axlUSDC is Axelar's canonical deployment on Filecoin mainnet, per
// https://docs.filecoin.io/smart-contracts/advanced/cross-chain-bridges
export const paymentTokensByChainId: Record<number, PaymentTokenOption[]> = {
  [mainnet.id]: [
    { address: mainnet.contracts.usdfc.address, symbol: "USDFC", decimals: 18 },
    { address: "0xEB466342C4d449BC9f53A865D5Cb90586f405215", symbol: "axlUSDC", decimals: 6 },
  ],
  [calibration.id]: [{ address: calibration.contracts.usdfc.address, symbol: "USDFC", decimals: 18 }],
};
