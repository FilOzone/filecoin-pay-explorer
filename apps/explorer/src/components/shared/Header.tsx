import { Button } from "@filecoin-pay/ui/components/button";
import { Logo } from "@filecoin-pay/ui/components/logo";
import { Sheet, SheetContent, SheetTrigger } from "@filecoin-pay/ui/components/sheet";
import { ThemeToggle } from "@filecoin-pay/ui/components/theme-toggle";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const navigationLinks = [
  { name: "Console", href: "/console" },
  { name: "Rails", href: "/rails" },
  { name: "Accounts", href: "/accounts" },
  { name: "Operators", href: "/operators" },
];

function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const isActiveLink = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  };

  return (
    <header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
      <div className='max-w-screen-2xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8'>
        {/* Logo */}
        <a href='/' className='inline-flex items-center gap-2 transition-opacity hover:opacity-80'>
          <Logo />
        </a>

        {/* Desktop Navigation */}
        <nav aria-label='Main navigation' className='hidden md:flex items-center gap-1'>
          {navigationLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActiveLink(link.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground",
              )}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Right Side Actions */}
        <div className='flex items-center gap-3'>
          <ThemeToggle />

          {/* Mobile Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className='md:hidden'>
              <Button variant='ghost' size='icon' aria-label='Toggle menu'>
                {isOpen ? <X className='h-5 w-5' /> : <Menu className='h-5 w-5' />}
              </Button>
            </SheetTrigger>
            <SheetContent side='right' className='w-64'>
              <nav className='flex flex-col gap-2 mt-12'>
                {navigationLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "px-4 py-3 text-sm font-medium rounded-md transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActiveLink(link.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                    )}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default Header;
