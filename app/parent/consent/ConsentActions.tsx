'use client';
// The client half of the consent form (BUILD SPEC §13). Grant is one tap; WITHDRAW is
// gated behind an explicit confirm — withdrawing immediately revokes the live view, so
// it must never be an accidental tap. The real state change happens in the server action.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ConsentActions({
  active,
  onGrant,
  onWithdraw,
}: {
  active: boolean;
  onGrant: () => Promise<void>;
  onWithdraw?: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const run = (action?: () => Promise<void>) => {
    if (!action) return;
    startTransition(async () => {
      await action();
      setConfirming(false);
      router.refresh();
    });
  };

  if (!active) {
    return (
      <Button variant="primary" disabled={pending} onClick={() => run(onGrant)}>
        <ShieldCheck size={15} strokeWidth={1.75} aria-hidden />
        {pending ? 'Granting…' : 'Grant consent'}
      </Button>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2 rounded-ops border border-sig-alert/40 bg-sig-alert/[0.06] p-2.5">
        <p className="text-12 leading-relaxed text-ink-700">
          Withdrawing consent <strong>immediately closes the live view</strong> for this child. You
          can grant it again later. Continue?
        </p>
        <div className="flex gap-2">
          <Button variant="danger" disabled={pending} onClick={() => run(onWithdraw)}>
            <ShieldOff size={15} strokeWidth={1.75} aria-hidden />
            {pending ? 'Withdrawing…' : 'Yes, withdraw'}
          </Button>
          <Button variant="quiet" disabled={pending} onClick={() => setConfirming(false)}>
            Keep consent
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
      <ShieldOff size={15} strokeWidth={1.75} aria-hidden />
      Withdraw consent
    </Button>
  );
}
