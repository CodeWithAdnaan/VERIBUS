import { RailLink } from './RailLink';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

export function Rail({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((it) => {
        const { Icon, href, label } = it;
        return (
          <RailLink key={href} href={href} label={label}>
            <Icon size={18} strokeWidth={1.5} aria-hidden />
          </RailLink>
        );
      })}
    </nav>
  );
}
