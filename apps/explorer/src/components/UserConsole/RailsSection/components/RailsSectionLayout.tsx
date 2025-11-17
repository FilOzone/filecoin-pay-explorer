const RailsSectionLayout = ({ children }: { children: React.ReactNode }) => (
  <div className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <h3 className='text-2xl font-medium'>Payment Rails</h3>
    </div>
    {children}
  </div>
);

export default RailsSectionLayout;
