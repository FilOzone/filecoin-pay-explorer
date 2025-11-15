import { cn } from "@filecoin-pay/ui/lib/utils";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import type { LinkProps } from "next/link";
import Link from "next/link";

interface StyledLinkProps extends Omit<LinkProps, "href"> {
  to?: string;
  href?: string;
  external?: boolean;
  showExternalIcon?: boolean;
  className?: string;
  children: React.ReactNode;
}

const StyledLink = ({
  to,
  href,
  external = false,
  showExternalIcon = false,
  className,
  children,
  ...props
}: StyledLinkProps) => {
  const baseStyles = "text-link hover:text-link-hover hover:underline transition-colors font-medium";
  const combinedClassName = cn(baseStyles, className);

  if (external || href) {
    const linkHref = href || to || "#";
    return (
      <a
        href={linkHref}
        target={external ? "_blank" : "_self"}
        rel={external ? "noopener noreferrer" : undefined}
        className={cn(combinedClassName, showExternalIcon && "inline-flex items-center gap-1")}
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
        {showExternalIcon && <ExternalLinkIcon className='h-4 w-4' />}
      </a>
    );
  }

  if (to) {
    return (
      <Link href={to} className={combinedClassName} {...props}>
        {children}
      </Link>
    );
  }

  return <span className={combinedClassName}>{children}</span>;
};

export default StyledLink;
