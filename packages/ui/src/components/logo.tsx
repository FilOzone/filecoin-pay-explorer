import { cn } from "@filecoin-pay/ui/lib/utils";

export type LogoProps = {
  className?: string;
  withText?: boolean;
};

export function Logo({ className, withText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width='28'
        height='28'
        viewBox='0 0 48 48'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden
        className='text-foreground'
      >
        <circle cx='24' cy='24' r='16' stroke='currentColor' strokeWidth='2.5' />
        <path d='M16 20h16M16 26h14' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' />
      </svg>
      {withText && (
        <div className='leading-tight'>
          <div className='text-base font-semibold tracking-tight'>Filecoin Pay</div>
          <div className='text-[10px] text-muted-foreground -mt-0.5'>Explorer</div>
        </div>
      )}
    </div>
  );
}
