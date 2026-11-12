import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { type Address, getAddress, type TransactionReceipt } from "viem";
import { Notice } from "@/components/shared/Notice";
import { getChain } from "@/constants/chains";
import type { ServiceApproval } from "@/hooks/useAccountServices";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { type OperatorApprovalState, useOperatorApproval } from "@/hooks/useOperatorApproval";
import type { Network } from "@/types";
import { formatAddress } from "@/utils/formatter";
import {
  type ApprovalTerms,
  formatLockupLimit,
  formatPeriodLimit,
  formatRateLimit,
  type LimitField,
  type LimitsForm,
  limitsForm,
  parseLimitsForm,
  REVOKED_TERMS,
} from "../utils/spendingLimits";

type LimitToken = ServiceApproval["token"];

interface EditLimitsDialogProps {
  network: Network;
  owner: Address;
  operator: Address;
  token: LimitToken;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (receipt: TransactionReceipt) => void;
}

type SubmitLimits = (approve: boolean, terms: ApprovalTerms) => Promise<void>;

interface FormProps {
  operator: Address;
  token: LimitToken;
  current: OperatorApprovalState;
  isSubmitting: boolean;
  onSubmit: SubmitLimits;
  onCancel: () => void;
}

const LimitInput = ({
  id,
  label,
  unlimitedLabel,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  unlimitedLabel: string;
  hint?: string;
  value: LimitField;
  onChange: (value: LimitField) => void;
  disabled: boolean;
}) => (
  <div className='grid gap-1.5'>
    <div className='flex items-center justify-between gap-4'>
      <Label htmlFor={id}>{label}</Label>
      <label className='flex cursor-pointer items-center gap-2 text-sm'>
        <input
          type='checkbox'
          aria-label={unlimitedLabel}
          checked={value.unlimited}
          onChange={(event) => onChange({ ...value, unlimited: event.target.checked })}
          disabled={disabled}
          className='rounded'
        />
        Unlimited
      </label>
    </div>
    <Input
      id={id}
      inputMode='decimal'
      placeholder={value.unlimited ? "Unlimited" : "0"}
      value={value.unlimited ? "" : value.text}
      onChange={(text) => onChange({ ...value, text })}
      disabled={value.unlimited || disabled}
    />
    {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
  </div>
);

const ComparisonRows = ({ token, from, to }: { token: LimitToken; from: ApprovalTerms; to: ApprovalTerms }) => {
  const decimals = Number(token.decimals);
  const rows = [
    [
      "Rate",
      formatRateLimit(from.rateAllowance, decimals, token.symbol),
      formatRateLimit(to.rateAllowance, decimals, token.symbol),
    ],
    [
      "Lockup",
      formatLockupLimit(from.lockupAllowance, decimals, token.symbol),
      formatLockupLimit(to.lockupAllowance, decimals, token.symbol),
    ],
    ["Max lockup period", formatPeriodLimit(from.maxLockupPeriod), formatPeriodLimit(to.maxLockupPeriod)],
  ];

  return (
    <table className='w-full text-sm'>
      <caption className='sr-only'>Current and new limits</caption>
      <thead>
        <tr className='text-left text-xs text-muted-foreground'>
          <th className='py-1 font-normal'>Limit</th>
          <th className='py-1 font-normal'>Current</th>
          <th className='py-1 font-normal'>New</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, before, after]) => (
          <tr key={label}>
            <th className='py-1 pr-3 text-left font-normal text-muted-foreground'>{label}</th>
            <td className='py-1 pr-3'>{before}</td>
            <td className={before === after ? "py-1" : "py-1 font-semibold"}>{after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const SubmitLabel = ({ isBusy, children }: { isBusy: boolean; children: string }) =>
  isBusy ? (
    <span className='flex items-center gap-2'>
      <Loader2 className='h-4 w-4 animate-spin' />
      Processing...
    </span>
  ) : (
    children
  );

const RevokeConfirmation = ({
  operator,
  token,
  current,
  isSubmitting,
  onSubmit,
  onBack,
}: Omit<FormProps, "onCancel"> & { onBack: () => void }) => (
  <>
    <DialogHeader>
      <DialogTitle>Revoke {token.symbol} approval?</DialogTitle>
      <DialogDescription>
        {formatAddress(operator)} will no longer be able to open payment rails or raise rates in {token.symbol}.
      </DialogDescription>
    </DialogHeader>
    <div className='grid gap-4 py-4'>
      <Notice tone='warn'>
        Rails you already have with this service keep running until they are terminated. To use the service again,
        approve it with new limits.
      </Notice>
      <ComparisonRows token={token} from={current} to={REVOKED_TERMS} />
    </div>
    <DialogFooter>
      <Button variant='ghost' onClick={onBack} disabled={isSubmitting} className='py-2'>
        Back
      </Button>
      <Button
        variant='primary'
        onClick={() => void onSubmit(false, REVOKED_TERMS)}
        disabled={isSubmitting}
        className='py-2'
      >
        <SubmitLabel isBusy={isSubmitting}>Revoke</SubmitLabel>
      </Button>
    </DialogFooter>
  </>
);

/** Mounted once the fresh read lands, so the form starts from the chain's values. */
const EditLimitsForm = (props: FormProps) => {
  const { operator, token, current, isSubmitting, onSubmit, onCancel } = props;
  const decimals = Number(token.decimals);
  const [form, setForm] = useState<LimitsForm>(() => limitsForm(current, decimals));
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  if (confirmingRevoke) {
    return <RevokeConfirmation {...props} onBack={() => setConfirmingRevoke(false)} />;
  }

  const update = parseLimitsForm(form, current, decimals);
  const setField = (key: keyof LimitsForm) => (value: LimitField) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{current.isApproved ? "Edit spending limits" : "Approve service again"}</DialogTitle>
        <DialogDescription>
          What {formatAddress(operator)} may charge your Filecoin Pay account in {token.symbol}.
        </DialogDescription>
      </DialogHeader>

      <div className='grid gap-4 py-4'>
        <LimitInput
          id='rateLimit'
          label={`Rate limit (${token.symbol} per month)`}
          unlimitedLabel='Unlimited rate'
          hint={`In use: ${formatRateLimit(current.rateUsage, decimals, token.symbol)}`}
          value={form.rate}
          onChange={setField("rate")}
          disabled={isSubmitting}
        />
        <LimitInput
          id='lockupLimit'
          label={`Lockup limit (${token.symbol})`}
          unlimitedLabel='Unlimited lockup'
          hint={`In use: ${formatLockupLimit(current.lockupUsage, decimals, token.symbol)}`}
          value={form.lockup}
          onChange={setField("lockup")}
          disabled={isSubmitting}
        />
        <LimitInput
          id='periodLimit'
          label='Max lockup period (days)'
          unlimitedLabel='Unlimited lockup period'
          value={form.period}
          onChange={setField("period")}
          disabled={isSubmitting}
        />

        {update.status === "invalid" ? (
          <p role='alert' className='text-sm text-destructive'>
            Enter plain decimal amounts and a whole number of days.
          </p>
        ) : null}

        {update.status === "ready" ? (
          <>
            <ComparisonRows token={token} from={current} to={update.terms} />
            {update.belowUsage ? (
              <Notice tone='warn' role='status' title='Below what this service already uses'>
                Rails you already have keep running, but the service can't open new rails or raise rates until its usage
                is back under these limits.
              </Notice>
            ) : null}
          </>
        ) : null}
      </div>

      <DialogFooter>
        {current.isApproved ? (
          <Button
            variant='tertiary'
            onClick={() => setConfirmingRevoke(true)}
            disabled={isSubmitting}
            className='py-2 sm:mr-auto'
          >
            Revoke
          </Button>
        ) : null}
        <Button variant='ghost' onClick={onCancel} disabled={isSubmitting} className='py-2'>
          Cancel
        </Button>
        <Button
          variant='primary'
          onClick={() => {
            if (update.status === "ready") void onSubmit(true, update.terms);
          }}
          disabled={isSubmitting || update.status !== "ready"}
          className='py-2'
        >
          <SubmitLabel isBusy={isSubmitting}>{current.isApproved ? "Update limits" : "Approve"}</SubmitLabel>
        </Button>
      </DialogFooter>
    </>
  );
};

/** Lives inside the dialog panel, which unmounts on close, so every opening reads the chain afresh. */
const EditLimitsBody = ({
  network,
  owner,
  ...formProps
}: Omit<FormProps, "current"> & { network: Network; owner: Address }) => {
  const approval = useOperatorApproval(network, getAddress(formProps.token.id), owner, formProps.operator);

  // A cached read from an earlier opening may be stale; the form waits for this mount's own.
  if (!approval.isFetchedAfterMount) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit spending limits</DialogTitle>
          <DialogDescription>Reading your current limits from the chain...</DialogDescription>
        </DialogHeader>
        <Loader2 aria-hidden='true' className='mx-auto my-6 h-6 w-6 animate-spin text-muted-foreground' />
      </>
    );
  }

  if (approval.isError || !approval.data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit spending limits</DialogTitle>
          <DialogDescription>Your current limits could not be read from the chain.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='ghost' onClick={formProps.onCancel} className='py-2'>
            Cancel
          </Button>
          <Button
            variant='primary'
            onClick={() => void approval.refetch()}
            disabled={approval.isFetching}
            className='py-2'
          >
            Try again
          </Button>
        </DialogFooter>
      </>
    );
  }

  return <EditLimitsForm {...formProps} current={approval.data} />;
};

export const EditLimitsDialog = ({
  network,
  owner,
  operator,
  token,
  open,
  onOpenChange,
  onConfirmed,
}: EditLimitsDialogProps) => {
  const chain = getChain(network);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { execute, isExecuting } = useContractTransaction({
    account: owner,
    contractAddress: chain.contracts.payments.address,
    abi: chain.contracts.payments.abi,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers?.default.url,
  });

  // Closing while the wallet has the request would abandon it.
  const handleOpenChange = (next: boolean) => {
    if (!next && isSubmitting) return;
    onOpenChange(next);
  };

  const submit: SubmitLimits = async (approve, terms) => {
    setIsSubmitting(true);
    try {
      await execute({
        functionName: "setOperatorApproval",
        args: [token.id, operator, approve, terms.rateAllowance, terms.lockupAllowance, terms.maxLockupPeriod],
        metadata: { type: approve ? "updateApproval" : "revokeApproval", operator, token: token.symbol },
        onSubmitOnChain: () => onOpenChange(false),
        onConfirmed,
      });
    } catch (error) {
      // execute() already toasted; the form stays as it was so the owner can try again.
      console.error("Updating spending limits failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // A form opened before the last update confirms would start from limits that update is about to replace.
  // Only while open: the panel that just submitted keeps its form through the leave transition.
  const isConfirming = open && isExecuting && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-500px' showCloseButton={!isSubmitting}>
        {isConfirming ? (
          <>
            <DialogHeader>
              <DialogTitle>Edit spending limits</DialogTitle>
              <DialogDescription>Waiting for your last update to confirm...</DialogDescription>
            </DialogHeader>
            <Loader2 aria-hidden='true' className='mx-auto my-6 h-6 w-6 animate-spin text-muted-foreground' />
          </>
        ) : (
          <EditLimitsBody
            network={network}
            owner={owner}
            operator={operator}
            token={token}
            isSubmitting={isSubmitting}
            onSubmit={submit}
            onCancel={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditLimitsDialog;
