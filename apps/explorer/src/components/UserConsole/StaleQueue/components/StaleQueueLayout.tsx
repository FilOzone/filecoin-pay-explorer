// Inactivity alert emails deep-link to #stale.
const StaleQueueLayout = ({ children }: { children: React.ReactNode }) => (
  <div id='stale' className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <h3 className='text-2xl font-medium'>Inactive Datasets</h3>
    </div>
    {children}
  </div>
);

export default StaleQueueLayout;
