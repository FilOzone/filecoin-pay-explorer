import { Button } from "@filecoin-pay/ui/components/button";
import { Separator } from "@filecoin-pay/ui/components/separator";

export function Footer() {
  return (
    <footer className='mt-10 border-t'>
      <div className='max-w-screen-2xl mx-auto px-3 sm:px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground'>
        <p className='text-center sm:text-left'>Built with ❤️ for the Filecoin ecosystem.</p>
        <div className='flex items-center gap-2'>
          <Button asChild variant='ghost' size='sm'>
            <a
              href='https://github.com/FilOzone/filecoin-pay'
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center'
            >
              Contracts
            </a>
          </Button>
          <Separator orientation='vertical' className='h-4' />
          <Button asChild variant='ghost' size='sm'>
            <a
              href='https://github.com/FilOzone/filecoin-pay-explorer'
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center'
            >
              Explorer
            </a>
          </Button>
        </div>
      </div>
    </footer>
  );
}
