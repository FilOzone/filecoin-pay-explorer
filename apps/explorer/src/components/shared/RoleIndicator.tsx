import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface RoleIndicatorProps {
  role: "payer" | "payee";
}

export const RoleIndicator: React.FC<RoleIndicatorProps> = ({ role }) => {
  const isPayer = role === "payer";
  return (
    <Badge variant={isPayer ? "tertiary" : "primary"} icon={isPayer ? ArrowUpRight : ArrowDownLeft}>
      {isPayer ? "Payer" : "Payee"}
    </Badge>
  );
};
