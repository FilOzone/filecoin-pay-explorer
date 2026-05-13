import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface RoleIndicatorProps {
  role: "payer" | "payee";
}

export const RoleIndicator: React.FC<RoleIndicatorProps> = ({ role }) => {
  if (role === "payer") {
    return (
      <div className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/10 text-destructive'>
        <ArrowUpRight className='h-3.5 w-3.5' />
        <span className='text-xs font-medium'>Payer</span>
      </div>
    );
  }
  return (
    <div className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400'>
      <ArrowDownLeft className='h-3.5 w-3.5' />
      <span className='text-xs font-medium'>Payee</span>
    </div>
  );
};
