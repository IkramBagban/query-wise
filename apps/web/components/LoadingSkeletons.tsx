import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function PageHeaderSkeleton({ actions = 2, announce = true }: { actions?: number; announce?: boolean }) {
  const content = (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-52 max-w-[60vw]" />
        <Skeleton className="h-4 w-80 max-w-[72vw]" />
      </div>
      {actions > 0 ? (
        <div className="hidden shrink-0 gap-2 sm:flex">
          {Array.from({ length: actions }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24" />
          ))}
        </div>
      ) : null}
    </>
  );
  if (!announce) return <div className="flex items-start justify-between gap-4">{content}</div>;
  return <LoadingRegion label="Loading page header" className="flex items-start justify-between gap-4">{content}</LoadingRegion>;
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <LoadingRegion label="Loading cards" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="flex min-h-36 flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="size-9" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="mt-auto flex gap-2 border-t border-border pt-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        </Card>
      ))}
    </LoadingRegion>
  );
}

export function ConnectionRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading connections" className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index} className="flex h-[76px] items-center gap-3 p-4">
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-48 max-w-[70%]" />
            <div className="mt-2 flex gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="hidden h-4 w-28 sm:block" />
            </div>
          </div>
          <div className="hidden gap-2 md:flex">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="size-8 shrink-0" />
        </Card>
      ))}
    </LoadingRegion>
  );
}

export function SchemaBrowserSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading schema" className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex h-11 items-center gap-3 rounded-lg border border-border bg-surface px-3">
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className={cn("h-4", index % 3 === 0 ? "w-2/3" : index % 3 === 1 ? "w-1/2" : "w-3/5")} />
            <Skeleton className="ml-auto h-3 w-10" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function SidebarRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading navigation items" className="flex flex-col gap-2 px-3 py-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex h-6 items-center gap-2">
          <Skeleton className="size-3.5 shrink-0" />
          <Skeleton className={cn("h-3", index % 2 === 0 ? "w-28" : "w-20")} />
          <Skeleton className="ml-auto h-3 w-8" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function SearchResultsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading conversations" className="flex flex-col gap-1 p-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex h-10 items-center gap-3 rounded-lg px-3">
          <Skeleton className="size-4 shrink-0" />
          <Skeleton className={cn("h-3.5", index % 3 === 0 ? "w-2/3" : "w-1/2")} />
          <Skeleton className="ml-auto h-3 w-12" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function MessageListSkeleton({ messages = 3, announce = true }: { messages?: number; announce?: boolean }) {
  const content = (
    <>
      {Array.from({ length: messages }).map((_, index) =>
        index % 2 === 0 ? (
          <div key={index} className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex w-full max-w-2xl flex-col gap-2">
              <div className="flex gap-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-12" /></div>
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
              {index === messages - 1 ? <Skeleton className="mt-2 h-52 w-full rounded-lg" /> : null}
            </div>
          </div>
        ) : (
          <div key={index} className="ml-auto flex max-w-[80%] items-start gap-3">
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-16 w-52 rounded-lg" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="size-10 shrink-0 rounded-full" />
          </div>
        ),
      )}
    </>
  );
  const className = "mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-8";
  if (!announce) return <div className={className}>{content}</div>;
  return <LoadingRegion label="Loading messages" className={className}>{content}</LoadingRegion>;
}


export function AppPageSkeleton() {
  return (
    <LoadingRegion label="Loading workspace" className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeaderSkeleton announce={false} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-40 w-full" />
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
    </LoadingRegion>
  );
}
