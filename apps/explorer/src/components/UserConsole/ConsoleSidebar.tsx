import { Bell, BellOff, Compass, LayoutDashboard, ShieldCheck } from "lucide-react";
import Link from "next/link";

export type ConsoleTab = "dashboard" | "authorizations" | "notifications";

const navItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "authorizations" as const, label: "Manage", icon: ShieldCheck },
];

interface ConsoleSidebarProps {
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  subscribed?: boolean;
  isNotificationsEligible?: boolean;
  onNavigate?: () => void;
  className?: string;
}

export function ConsoleSidebar({
  activeTab,
  onTabChange,
  subscribed,
  isNotificationsEligible,
  onNavigate,
  className,
}: ConsoleSidebarProps) {
  const isAlertsActive = activeTab === "notifications";

  const handleTabChange = (tab: ConsoleTab) => {
    onTabChange(tab);
    onNavigate?.();
  };

  return (
    <aside
      className={
        className ?? "sticky top-6 self-start w-48 shrink-0 border-r border-border pr-4 flex-col gap-4 hidden lg:flex"
      }
    >
      <nav className='flex flex-col gap-0.5'>
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type='button'
            onClick={() => handleTabChange(id)}
            className={`group flex items-center gap-3 py-2 text-sm transition-colors text-left w-full ${
              activeTab === id
                ? "border-l-2 border-foreground pl-3 text-foreground font-medium"
                : "border-l-2 border-transparent pl-3 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className='size-4 shrink-0' />
            {label}
          </button>
        ))}

        {isNotificationsEligible && (
          <Link
            href='/console/notifications'
            onClick={onNavigate}
            className={`flex items-center gap-3 py-2 text-sm transition-colors ${
              isAlertsActive
                ? "border-l-2 border-foreground pl-3 text-foreground font-medium"
                : "border-l-2 border-transparent pl-3 text-muted-foreground hover:text-foreground"
            }`}
          >
            {subscribed ? <Bell className='size-4 shrink-0 text-green-500' /> : <BellOff className='size-4 shrink-0' />}
            <span>Email notifications</span>
            {subscribed ? (
              <span className='text-xs font-medium text-green-500'>ON</span>
            ) : (
              <span className='text-xs text-muted-foreground'>OFF</span>
            )}
          </Link>
        )}
      </nav>

      <div className='border-t border-border pt-3'>
        <Link
          href='/'
          onClick={onNavigate}
          className='flex items-center gap-2.5 pl-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
        >
          <Compass className='size-3.5 shrink-0' />
          Pay Explorer
        </Link>
      </div>
    </aside>
  );
}
