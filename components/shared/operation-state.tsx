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
    <div className="rounded-lg border bg-card p-5 text-sm">
      <p className="font-medium">{title}</p>
      {detail ? <p className="mt-1 text-muted-foreground">{detail}</p> : null}
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction} type="button" variant="outline">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
