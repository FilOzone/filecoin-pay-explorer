import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  OperatorApprovals,
  OperatorErrorState,
  OperatorLoadingState,
  OperatorNotFoundState,
  OperatorOverview,
  OperatorRails,
  OperatorTokens,
} from "@/components/Operator";
import { useOperatorDetails } from "@/hooks/useOperatorDetails";
import { formatAddress } from "@/utils/formatter";

const OperatorDetail = () => {
  const { address } = useParams<{ address: string }>();
  const { data: operator, isLoading, isError, error, refetch } = useOperatorDetails(address || "");

  if (isLoading) {
    return <OperatorLoadingState />;
  }

  if (isError) {
    return <OperatorErrorState refetch={refetch} error={error} />;
  }

  if (!operator) {
    return <OperatorNotFoundState address={address || ""} />;
  }

  return (
    <main className='flex-1 px-3 sm:px-6 py-6'>
      <div className='flex flex-col gap-6'>
        {/* Back button and header */}
        <div className='flex flex-col gap-4'>
          <Link to='/operators' className='flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit'>
            <ArrowLeft className='h-4 w-4' />
            <span className='text-sm'>Back to Operators</span>
          </Link>
          <h1 className='text-3xl font-bold'>Operator {formatAddress(operator.address)}</h1>
        </div>

        {/* Operator Overview */}
        <OperatorOverview operator={operator} />

        {/* Operator Tokens */}
        <OperatorTokens operator={operator} />

        {/* Operator Rails */}
        <OperatorRails operator={operator} />

        {/* Operator Approvals */}
        <OperatorApprovals operator={operator} />
      </div>
    </main>
  );
};

export default OperatorDetail;
