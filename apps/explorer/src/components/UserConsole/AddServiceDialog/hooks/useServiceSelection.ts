// Owns the "which service to add" form state. Transaction orchestration
// lives in useAddServiceLifecycle; token selection in useTokenSelection.
import { useCallback, useState } from "react";
import { isAddress } from "viem";
import { type ApprovableService, useApprovableServices } from "@/hooks/useApprovableServices";
import useSynapse from "@/hooks/useSynapse";
import { CUSTOM_OPTION } from "./constants";

export interface ServiceSelection {
  services: ApprovableService[];
  isLoadingServices: boolean;
  serviceChoice: string;
  chooseService: (value: string) => void;
  customServiceInput: string;
  enterCustomServiceAddress: (value: string) => void;
  selectedService: ApprovableService | undefined;
  operatorAddress: `0x${string}` | undefined;
  reset: () => void;
}

// Everything in this dialog — service list, token list, payments contract,
// permit domain — derives from the same useSynapse chain so a wallet/app
// network divergence can't mix networks within one submission.
//
// Pause service discovery while the pre-mounted dialog is closed.
export function useServiceSelection(open: boolean): ServiceSelection {
  const { constants } = useSynapse();
  const [serviceChoice, chooseService] = useState("");
  const [customServiceInput, enterCustomServiceAddress] = useState("");
  const { services, isLoading: isLoadingServices } = useApprovableServices({
    enabled: open,
    networkOverride: constants.chain.slug,
  });

  const selectedService =
    serviceChoice !== CUSTOM_OPTION ? services.find((s) => s.address === serviceChoice) : undefined;
  const operatorAddress: `0x${string}` | undefined = (() => {
    if (selectedService) return selectedService.address as `0x${string}`;
    const trimmed = customServiceInput.trim();
    if (serviceChoice === CUSTOM_OPTION && isAddress(trimmed)) return trimmed;
  })();

  const reset = useCallback(() => {
    chooseService("");
    enterCustomServiceAddress("");
  }, []);

  return {
    services,
    isLoadingServices,
    serviceChoice,
    chooseService,
    customServiceInput,
    enterCustomServiceAddress,
    selectedService,
    operatorAddress,
    reset,
  };
}
