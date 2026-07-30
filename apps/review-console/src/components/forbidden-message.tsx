import { Shield } from "lucide-react";

export function ForbiddenMessage({
  title = "Access denied",
  message = "Your role does not have permission to view this page.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="py-16 text-center" data-testid="forbidden-message">
      <Shield className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
      <h2 className="mt-4 font-serif text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md font-sans text-sm text-muted">{message}</p>
    </div>
  );
}
