import { Logo } from "@filecoin-pay/ui/components/logo";
import { ThemeToggle } from "@filecoin-pay/ui/components/theme-toggle";
import { Link } from "react-router-dom";

function Header() {
  return (
    <header className='sticky top-0 z-40 w-full border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
      <div className='max-w-screen-2xl mx-auto flex h-14 items-center justify-between px-3 sm:px-4'>
        <a href='/' className='inline-flex items-center gap-2'>
          <Logo />
        </a>

        <nav aria-label='Main navigation' className='hidden gap-2 sm:flex'>
          <Link to='/console'>Console</Link>
          <Link to='/rails'>Rails</Link>
          <Link to='/accounts'>Accounts</Link>
          <Link to='/operators'>Operators</Link>
        </nav>

        <div className='flex items-center gap-1'>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default Header;
