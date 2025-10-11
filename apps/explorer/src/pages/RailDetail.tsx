import type { RailState } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  RailErrorState,
  RailLoadingState,
  RailNotFoundState,
  RailOverview,
  RailRateChanges,
  RailSettlements,
} from "@/components/Rail";
import { useRailDetails } from "@/hooks/useRailDetails";

const getStatusVariant = (state: RailState): "default" | "secondary" | "destructive" | "outline" => {
  switch (state) {
    case "ACTIVE":
      return "default";
    case "ZERORATE":
      return "secondary";
    case "TERMINATED":
      return "destructive";
    case "FINALIZED":
      return "outline";
    default:
      return "secondary";
  }
};

const RailDetail = () => {
  const { railId } = useParams<{ railId: string }>();
  const { data: rail, isLoading, isError, error, refetch } = useRailDetails(railId || "");

  if (isLoading) {
    return <RailLoadingState />;
  }

  if (isError) {
    return <RailErrorState refetch={refetch} error={error} />;
  }

  if (!rail) {
    return <RailNotFoundState railId={railId || ""} />;
  }

  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        {/* Back button and header */}
        <div className='flex flex-col gap-4'>
          <Link to='/rails' className='flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit'>
            <ArrowLeft className='h-4 w-4' />
            <span className='text-sm'>Back to Rails</span>
          </Link>
          <div className='flex items-center gap-3'>
            <h1 className='text-3xl font-bold'>Rail #{rail.railId.toString()}</h1>
            <Badge variant={getStatusVariant(rail.state)}>{rail.state}</Badge>
          </div>
        </div>

        {/* Rail Overview */}
        <RailOverview rail={rail} />

        {/* Settlements */}
        <RailSettlements rail={rail} />

        {/* Rate Changes */}
        <RailRateChanges rail={rail} />
      </div>
    </main>
  );
};

export default RailDetail;
