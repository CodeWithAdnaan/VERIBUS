import { OpsShell } from '@/components/shell/OpsShell';
import { requireProfile } from '@/lib/server/auth';
import { Gauge, Bus, ClipboardList, SlidersHorizontal, MessageCircleQuestion } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RtoLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(['rto_officer']);
  const nav = [
    { href: '/rto', label: 'District overview', Icon: Gauge },
    { href: '/rto/vehicles', label: 'Vehicles', Icon: Bus },
    { href: '/rto/inspections', label: 'Inspections', Icon: ClipboardList },
    { href: '/rto/policy', label: 'Policy', Icon: SlidersHorizontal },
    { href: '/rto/ask', label: 'Ask', Icon: MessageCircleQuestion },
  ];
  return (
    <OpsShell
      navItems={nav}
      title="RTO — District overview"
      subtitle="Summary + compliance data only. No raw location."
      user={{ full_name: profile.full_name, role: profile.role }}
    >
      {children}
    </OpsShell>
  );
}
