import {
  type NavigationMenuLinkProps,
  NavigationMenuLink as SharedNavigationMenuLink,
} from "@filecoin-foundation/ui-filecoin/Navigation/NavigationMenuLink";
import clsx from "clsx";

const variants = {
  internal: "inline-block max-w-56 p-4 focus:brand-outline rounded-xl",
};

export function NavigationMenuLink(props: NavigationMenuLinkProps & { variant: keyof typeof variants }) {
  const { variant, className, ...linkProps } = props;

  return <SharedNavigationMenuLink className={clsx(variants[variant], className)} {...linkProps} />;
}
