import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { devLogAsync } = await import("@/lib/v2/observability");
  await devLogAsync(
    "error",
    "next.request.unhandled",
    "Next.js captured an unhandled request error.",
    {
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      digest:
        error && typeof error === "object" && "digest" in error
          ? String(error.digest)
          : undefined,
    },
    error,
  );
};
