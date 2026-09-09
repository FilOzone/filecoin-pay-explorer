import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { AlertCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import useSynapse from "@/hooks/useSynapse";
import {
  AddServiceFooter,
  DepositAmountField,
  PaymentTokenSelector,
  ServiceSelector,
  SpendingLimitsFields,
  TransactionStatusPanel,
} from "./components";
import { useAddServiceForm, useAddServiceLifecycle, useServiceSelection, useTokenSelection } from "./hooks";

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddServiceDialog: React.FC<AddServiceDialogProps> = ({ open, onOpenChange }) => {
  const serviceSelection = useServiceSelection(open);
  const tokenSelection = useTokenSelection(open);
  const lifecycle = useAddServiceLifecycle();
  const isBusy = lifecycle.stage === "awaiting-signature";

  const { operatorAddress } = serviceSelection;
  const { token, supportsPermit, balance, isLoadingBalance } = tokenSelection;
  const isOperatorSelected = !!operatorAddress;

  const { constants } = useSynapse();
  const explorerUrl = constants.chain.blockExplorers?.default.url;

  const form = useAddServiceForm({ token, balance, supportsPermit, isOperatorSelected, isBusy });

  useEffect(() => {
    if (!open) {
      serviceSelection.reset();
      tokenSelection.reset();
      form.reset();
    }
  }, [open, serviceSelection.reset, tokenSelection.reset, form.reset]);

  // Reopen only persisted work; closing a fresh submission should stay closed.
  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (open || hasAutoOpenedRef.current || !lifecycle.resumedContext) return;
    hasAutoOpenedRef.current = true;
    onOpenChange(true);
  }, [open, lifecycle.resumedContext, onOpenChange]);

  const handleSubmit = () => {
    const amounts = form.buildSubmitAmounts();
    if (!operatorAddress || !token || !amounts) return;
    void lifecycle.submit({ operatorAddress, token, ...amounts });
  };

  // Clear terminal runs on close; preserve persisted in-flight progress.
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isBusy) return;
      if (lifecycle.stage === "failed" || lifecycle.stage === "complete") lifecycle.reset();
    }
    onOpenChange(nextOpen);
  };
  const dismissDialog = () => handleDialogOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className='sm:max-w-[600px] max-h-[90vh] overflow-y-auto'
        showCloseButton={!isBusy}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add a Service</DialogTitle>
          <DialogDescription>
            Choose a service to pay through your Filecoin Pay account. You can set spending limits and remove it at any
            time.
          </DialogDescription>
        </DialogHeader>

        {lifecycle.stage !== "review" ? (
          <TransactionStatusPanel
            stage={lifecycle.stage}
            error={lifecycle.error}
            watchError={lifecycle.watchError}
            persistenceWarning={lifecycle.persistenceWarning}
            syncError={lifecycle.syncError}
            txHash={lifecycle.txHash}
            explorerUrl={explorerUrl}
            indexingTimedOut={lifecycle.indexingTimedOut}
            onRecheckReceipt={lifecycle.recheckReceipt}
            onRecheckIndexing={lifecycle.recheckIndexing}
          />
        ) : (
          <div className='grid gap-6 py-4'>
            <ServiceSelector selection={serviceSelection} explorerUrl={explorerUrl} />

            <PaymentTokenSelector
              selection={tokenSelection}
              explorerUrl={explorerUrl}
              onTokenChanged={form.clearAmounts}
            />

            {token && !supportsPermit && (
              <p className='flex items-center gap-2 text-xs text-muted-foreground'>
                <AlertCircle className='h-4 w-4 shrink-0 text-amber-500' />
                This token doesn't support gasless deposits (EIP-2612). Add the service now and deposit this token
                separately.
              </p>
            )}
            {token && supportsPermit && (
              <DepositAmountField
                token={token}
                amount={form.depositAmount}
                onAmountChange={form.setDepositAmount}
                balance={balance}
                isLoadingBalance={isLoadingBalance}
                isAmountEntered={!!form.depositAmount.trim()}
                isValidAmount={form.isDepositing}
                hasSufficientBalance={form.hasSufficientBalance}
              />
            )}

            <SpendingLimitsFields
              show={form.showLimits}
              onToggleShow={form.toggleShowLimits}
              isUnlimited={form.isUnlimited}
              onIsUnlimitedChange={form.setIsUnlimited}
              lockupAllowance={form.lockupAllowance}
              onLockupAllowanceChange={form.setLockupAllowance}
              rateAllowance={form.rateAllowance}
              onRateAllowanceChange={form.setRateAllowance}
              tokenSymbol={token?.symbol}
            />

            <p className='text-xs text-muted-foreground'>
              The service may reserve up to 30 days of upcoming charges from your deposit. You can remove it at any
              time.
            </p>
          </div>
        )}

        <AddServiceFooter
          stage={lifecycle.stage}
          canSubmit={form.canSubmit}
          isDepositing={form.isDepositing}
          onSubmit={handleSubmit}
          onDismiss={dismissDialog}
          onTryAgain={lifecycle.reset}
        />
      </DialogContent>
    </Dialog>
  );
};

export default AddServiceDialog;
