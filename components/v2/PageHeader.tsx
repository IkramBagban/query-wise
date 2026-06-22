export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-2">{eyebrow}</p> : null}
        <h1 className="mt-1 font-syne text-3xl font-semibold tracking-tight text-text-1">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-text-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
