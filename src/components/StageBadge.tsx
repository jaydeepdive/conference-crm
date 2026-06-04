import { stageMeta, confirmedMeta, paymentMeta } from "@/lib/constants";
import type { Stage, Confirmed, PaymentStatus } from "@/lib/types";

export function StageBadge({ stage }: { stage: Stage }) {
  const m = stageMeta(stage);
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.color}`}>{m.label}</span>;
}

export function ConfirmedBadge({ value }: { value: Confirmed }) {
  const m = confirmedMeta(value);
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.color}`}>{m.label}</span>;
}

export function PaymentBadge({ value }: { value: PaymentStatus }) {
  const m = paymentMeta(value);
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.color}`}>{m.label}</span>;
}
