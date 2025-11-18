export type InfiniteScrollLoaderProps = {
  observerTarget: React.RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
  hasData: boolean;
  loadingMessage?: string;
  endMessage?: string;
};

function InfiniteScrollLoader({
  observerTarget,
  isFetchingNextPage,
  hasNextPage,
  hasData,
  loadingMessage = "Loading more...",
  endMessage = "End of results",
}: InfiniteScrollLoaderProps) {
  return (
    <div ref={observerTarget} className='h-24 flex items-center justify-center'>
      {isFetchingNextPage && (
        <div className='flex items-center gap-3 text-muted-foreground'>
          <div className='flex gap-1.5'>
            <div className='h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]' />
            <div className='h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]' />
            <div className='h-2 w-2 rounded-full bg-primary animate-bounce' />
          </div>
          <span className='text-sm font-medium'>{loadingMessage}</span>
        </div>
      )}
      {!hasNextPage && hasData && (
        <div className='flex items-center gap-2 text-muted-foreground'>
          <div className='h-px w-12 bg-border' />
          <span className='text-sm'>{endMessage}</span>
          <div className='h-px w-12 bg-border' />
        </div>
      )}
    </div>
  );
}

export default InfiniteScrollLoader;
