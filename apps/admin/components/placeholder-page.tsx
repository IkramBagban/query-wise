export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mb-8 max-w-xl text-sm text-muted-foreground">{description}</p>
      <div className="rounded-xl border border-dashed border-border2 bg-muted/40 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Data surface not implemented yet (SPEC-08 Phase 1 shell).
        </p>
      </div>
    </div>
  );
}
