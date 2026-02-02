import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@filecoin-pay/ui/components/select";
import { GlobeIcon } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import useNetwork from "@/hooks/useNetwork";
import { supportedChains } from "@/services/wagmi/config";

const NetworkOptions = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { network } = useNetwork();

  const handleNetworkChange = (newNetwork: string) => {
    if (network === newNetwork) return;

    const pathParts = pathname.split("/").filter(Boolean);
    const firstSegment = pathParts[0];

    const validNetworks = supportedChains.map((chain) => chain.slug) as readonly string[];
    const isNetworkRoute = validNetworks.includes(firstSegment);

    if (!isNetworkRoute) {
      router.push(`/${newNetwork}`);
      return;
    }

    const pathWithoutNetwork = pathParts.slice(1);
    const newPath = `/${[newNetwork, ...pathWithoutNetwork].join("/")}`;

    router.push(newPath);
  };

  return (
    <Select value={network} onValueChange={handleNetworkChange}>
      <SelectTrigger className='w-[172px] py-6 pr-4 pl-4'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {supportedChains.map((chain) => (
            <SelectItem key={chain.id} value={chain.slug}>
              <div className='flex items-center gap-2 py-2'>
                <GlobeIcon className='h-5 w-5 text-zinc-400' />
                <span className={"text-base font-semibold"}>{chain.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default NetworkOptions;
