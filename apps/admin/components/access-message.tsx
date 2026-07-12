/**
 * Static denial surfaces — no nav shell, no panel content hints.
 */

export function AccessMessage({
  title,
  detail,
  code,
}: {
  title: string;
  detail: string;
  code: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {code}
        </p>
        <h1 className="mb-3 text-xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </main>
  );
}
