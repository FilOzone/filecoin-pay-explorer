const MetricItem: React.FC<{
  title: string;
  value: React.ReactNode;
}> = ({ title, value }) => (
  <div className='p-4 border rounded-lg bg-card text-card-foreground shadow-sm'>
    <h3 className='text-sm font-medium text-muted-foreground mb-1'>{title}</h3>
    <p className='text-2xl font-semibold'>{value ?? "N/A"}</p>
  </div>
);

export default MetricItem;
