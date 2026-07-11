import { Button } from "@/components/ui/button";

export function OperationState({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="app-surface glass-edge rounded-xl border p-5 text-sm">
      <div className="flex gap-3">
        <span className="mt-1 h-8 w-1.5 shrink-0 rounded-full bg-accent" />
        <div className="min-w-0">
          <p className="font-semibold tracking-normal">{title}</p>
          {detail ? <p className="mt-1 text-muted-foreground">{detail}</p> : null}
          {actionLabel && onAction ? (
            <Button className="mt-4" onClick={onAction} type="button" variant="outline">
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
