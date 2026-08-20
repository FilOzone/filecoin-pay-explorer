import type { UserToken } from "@filecoin-pay/types";
import { cn } from "@filecoin-pay/ui/lib/utils";
import USDFCLogo from "@/assests/USDFCLogo";

type TokenIconProps = {
  token: UserToken["token"];
  className?: string;
};

/** USDFC gets its brand mark; every other token falls back to a lettered avatar. */
const TokenIcon = ({ token, className }: TokenIconProps) => {
  if (token.symbol === "USDFC") {
    return <USDFCLogo className={cn("size-5", className)} />;
  }

  return (
    <div className={cn("flex size-5 items-center justify-center rounded-full bg-muted", className)}>
      <span className='text-[0.625rem] font-semibold text-muted-foreground'>{token.symbol.charAt(0)}</span>
    </div>
  );
};

export default TokenIcon;
