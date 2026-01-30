import { Loader2 } from "lucide-react";

type InlineTextLoaderProps = {
  text: string;
};

const InlineTextLoader = ({ text }: InlineTextLoaderProps) => (
  <div className='flex items-center gap-2'>
    <Loader2 className='h-4 w-4 animate-spin' />
    {text}
  </div>
);

export default InlineTextLoader;
