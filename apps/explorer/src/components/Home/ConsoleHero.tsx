import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PATHS } from "@/constants/paths";

// Console entry point rendered above search and stats on the network home page;
// complements the account button in the explorer header.
const ConsoleHero = () => (
  <PageSection backgroundVariant='light' paddingVariant='none'>
    <div className='w-full pt-10'>
      <div className='relative overflow-hidden rounded-xl border border-zinc-200 bg-white px-6 py-14 sm:py-16'>
        <div
          aria-hidden='true'
          className='absolute inset-0 [background-image:radial-gradient(circle,rgb(228_228_231)_1.5px,transparent_1.5px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_90%_100%_at_50%_40%,black,transparent_75%)]'
        />
        <div className='relative mx-auto flex max-w-2xl flex-col items-center text-center'>
          <span className='text-xs font-medium uppercase tracking-widest text-zinc-500'>
            Filecoin Onchain Cloud Console
          </span>
          <h2 className='mt-3 font-heading text-balance text-3xl/10 font-medium sm:text-4xl/12 sm:tracking-tight'>
            Manage your Filecoin services
          </h2>
          <p className='mt-3 max-w-xl text-balance text-zinc-500'>Manage services, billing, notifications, and more.</p>
          <Link
            href={PATHS.CONSOLE.path}
            className='mt-8 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700'
          >
            Open Console
            <ArrowRight className='size-4' />
          </Link>
        </div>
      </div>
    </div>
  </PageSection>
);

export default ConsoleHero;
