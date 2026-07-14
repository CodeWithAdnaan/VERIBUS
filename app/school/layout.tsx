import { OpsShell } from '@/components/shell/OpsShell';
import { requireProfile } from '@/lib/server/auth';
import { LayoutDashboard, Bell, MessageSquareWarning, Bus, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(['school_admin']);
  const nav = [
    { href: '/school', label: 'Live board', Icon: LayoutDashboard },
    { href: '/school/alerts', label: 'Alerts', Icon: Bell },
    { href: '/school/complaints', label: 'Complaints', Icon: MessageSquareWarning },
    { href: '/school/fleet', label: 'Fleet', Icon: Bus },
    { href: '/school/reports', label: 'Reports', Icon: FileText },
  ];
  return (
    <OpsShell navItems={nav} title="School operations" user={{ full_name: profile.full_name, role: profile.role }}>
      {children}
    </OpsShell>
  );
}
