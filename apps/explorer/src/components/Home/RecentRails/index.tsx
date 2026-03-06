"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { RefreshOverlay } from "@filecoin-foundation/ui-filecoin/RefreshOverlay";
import { AlertCircle, Search } from "lucide-react";
import { StyledLink } from "@/components/shared";
import useRecentRails from "@/hooks/useRecentRails";
import RecentRailsTable from "./components/RecentRailsTable";

const RecentRails = () => {
  const { data, isLoading, isError, error, isRefetching, refetch } = useRecentRails(10);

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-6 -mt-20'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-medium'>Recent Rails</h2>
          <StyledLink to='/rails' className='text-sm'>
            View All
          </StyledLink>
        </div>
        {isLoading && <LoadingStateCard message='Loading Recent Rails...' />}

        {isError && <ErrorState refetch={refetch} error={error} />}

        {data && data.length > 0 && (
          <RefreshOverlay isRefetching={isRefetching}>
            <RecentRailsTable data={data} />
          </RefreshOverlay>
        )}

        {!isLoading && data && data.length === 0 && <EmptyState />}
      </div>
    </PageSection>
  );
};

// const LoadingState = () => (
//   <section className='flex flex-col gap-4'>
//     <div className='flex items-center justify-between'>
//       <Skeleton className='h-7 w-32' />
//       <Skeleton className='h-5 w-16' />
//     </div>
//     <Card>
//       <div className='p-4'>
//         {[...Array(5)].map((_, i) => (
//           <div key={i} className='flex items-center justify-between py-3 border-b last:border-0'>
//             <Skeleton className='h-4 w-16' />
//             <div className='flex gap-8'>
//               <Skeleton className='h-4 w-20' />
//               <Skeleton className='h-4 w-16' />
//               <Skeleton className='h-4 w-24' />
//               <Skeleton className='h-4 w-24' />
//               <Skeleton className='h-4 w-20' />
//             </div>
//           </div>
//         ))}
//       </div>
//     </Card>
//   </section>
// );

const ErrorState: React.FC<{ refetch: () => void; error: Error }> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load rails'
    titleTag='h2'
    description={error?.message || "Something went wrong"}
  >
    <Button onClick={refetch} variant='primary'>
      Retry
    </Button>
  </EmptyStateCard>
);

const EmptyState = () => (
  <EmptyStateCard
    icon={Search}
    title='No rails found'
    titleTag='h2'
    description='There are no rails to display at the moment.'
  />
);

export default RecentRails;
