import { AlertCircle } from "lucide-react";

/** A background refresh failed; the last loaded account stays on screen. */
const StaleDataNotice = ({ error }: { error: Error | null }) => (
  <div className='flex items-start gap-2 rounded-lg border p-3 text-sm' role='alert'>
    <AlertCircle aria-hidden className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
    <span>
      {`Could not refresh your account, so this is the last data loaded.${error?.message ? ` ${error.message}` : ""}`}
    </span>
  </div>
);

export default StaleDataNotice;
