import type { ServicePrice } from "@/constants/service-metadata";

export const ServicePricing = ({ pricing }: { pricing: ServicePrice[] }) => (
  <section className='flex flex-col gap-4'>
    <h3 className='text-2xl font-medium'>Pricing</h3>
    <dl className='grid grid-cols-[repeat(2,auto)] justify-between gap-6 rounded-xl border px-6 py-8 sm:grid-cols-[repeat(4,auto)] sm:gap-4 md:gap-6 md:px-8 lg:px-12'>
      {pricing.map((price) => (
        <div key={price.label} className='flex flex-col gap-1'>
          <dt className='text-sm text-muted-foreground'>{price.label}</dt>
          <dd className='flex flex-col'>
            <span className='text-lg font-medium tabular-nums'>{price.amount}</span>
            <span className='text-xs text-muted-foreground'>{price.unit}</span>
          </dd>
        </div>
      ))}
    </dl>
  </section>
);

export default ServicePricing;
