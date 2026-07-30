export function ForbiddenMessage({
  title = "Access denied",
  message = "Your role does not have permission to view this page.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-surface p-8 text-center"
      data-testid="forbidden-message"
    >
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </div>
  );
}
