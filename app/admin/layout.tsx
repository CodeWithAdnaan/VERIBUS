import { OpsShell } from '@/components/shell/OpsShell';
import { PlayCircle, Trash2, TriangleAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';

// NOTE: /admin is intentionally NOT role-gated in the pilot so a presenter can drive
// the replay harness. In production this would require platform_admin. (See /limitations.)
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const nav = [
    { href: '/admin/replay', label: 'Replay harness', Icon: PlayCircle },
    { href: '/admin/retention', label: 'Retention', Icon: Trash2 },
    { href: '/admin/tamper', label: 'Tamper (DEV)', Icon: TriangleAlert },
  ];
  return (
    <OpsShell navItems={nav} title="Admin & demo tools">
      {children}
    </OpsShell>
  );
}
