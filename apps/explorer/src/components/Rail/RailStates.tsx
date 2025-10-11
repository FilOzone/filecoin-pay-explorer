import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@filecoin-pay/ui/components/empty";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export const RailLoadingState = () => (
  <main className='flex-1 px-3 sm:px-6 py-6'>
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        <Skeleton className='h-5 w-24' />
        <div className='flex items-center gap-3'>
          <Skeleton className='h-9 w-40' />
          <Skeleton className='h-6 w-20' />
        </div>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {[...Array(18)].map((_, i) => (
          <Card key={i} className='p-4'>
            <Skeleton className='h-4 w-24 mb-2' />
            <Skeleton className='h-6 w-32' />
          </Card>
        ))}
      </div>
      <Card className='p-4'>
        <Skeleton className='h-64 w-full' />
      </Card>
    </div>
  </main>
);

interface ErrorStateProps {
  refetch: () => void;
  error: Error;
}

export const RailErrorState: React.FC<ErrorStateProps> = ({ refetch, error }) => (
  <main className='flex-1 px-3 sm:px-6 py-6'>
    <div className='flex flex-col gap-6'>
      <Link to='/rails' className='flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit'>
        <ArrowLeft className='h-4 w-4' />
        <span className='text-sm'>Back to Rails</span>
      </Link>
      <Card>
        <div className='py-16'>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <AlertCircle />
              </EmptyMedia>
              <EmptyTitle>Failed to load rail details</EmptyTitle>
              <EmptyDescription>{error?.message || "Something went wrong"}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={refetch}>Retry</Button>
            </EmptyContent>
          </Empty>
        </div>
      </Card>
    </div>
  </main>
);

interface NotFoundStateProps {
  railId: string;
}

export const RailNotFoundState: React.FC<NotFoundStateProps> = ({ railId }) => (
  <main className='flex-1 px-3 sm:px-6 py-6'>
    <div className='flex flex-col gap-6'>
      <Link to='/rails' className='flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit'>
        <ArrowLeft className='h-4 w-4' />
        <span className='text-sm'>Back to Rails</span>
      </Link>
      <Card>
        <div className='py-16'>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Rail not found</EmptyTitle>
              <EmptyDescription>Rail with ID "{railId}" does not exist or has not been indexed yet.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link to='/rails'>
                <Button variant='outline'>Browse All Rails</Button>
              </Link>
            </EmptyContent>
          </Empty>
        </div>
      </Card>
    </div>
  </main>
);
