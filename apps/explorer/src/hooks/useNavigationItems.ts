import { useMemo } from "react";
import { PATHS } from "@/constants/paths";
import { FOC_URLS } from "@/constants/site-metadata";
import useNetwork from "./useNetwork";

type NavItem = {
  label: string;
  href: string;
};

export function useNavigationItems() {
  const { network } = useNetwork();

  const headerNavigationItems = useMemo(
    () => [
      {
        label: PATHS.RAILS.label,
        href: `/${network}${PATHS.RAILS.path}`,
      },
      {
        label: PATHS.OPERATORS.label,
        href: `/${network}${PATHS.OPERATORS.path}`,
      },
      {
        label: PATHS.ACCOUNTS.label,
        href: `/${network}${PATHS.ACCOUNTS.path}`,
      },
      {
        label: "Documentation",
        href: FOC_URLS.documentation,
      },
      {
        label: "GitHub",
        href: FOC_URLS.github,
      },
    ],
    [network],
  );

  // Mobile has no room for the header account button, so the console keeps a
  // plain nav entry there.
  const mobileNavigationItems = useMemo(
    () =>
      [{ label: PATHS.CONSOLE.label, href: PATHS.CONSOLE.path }, ...headerNavigationItems].filter(
        (item): item is NavItem => "href" in item,
      ),
    [headerNavigationItems],
  );

  return {
    headerNavigationItems,
    mobileNavigationItems,
  };
}
