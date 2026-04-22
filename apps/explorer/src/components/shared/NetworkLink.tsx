import type { LinkProps } from "next/link";
import Link from "next/link";
import useNetwork from "@/hooks/useNetwork";

const NetworkLink = ({ href, children, ...props }: LinkProps) => {
  const { network } = useNetwork();

  return (
    <Link href={`/${network}${href}`} {...props}>
      {children}
    </Link>
  );
};

export default NetworkLink;
