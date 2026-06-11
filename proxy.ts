import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";

const isApiRoute = createRouteMatcher(["/api(.*)"]);
const isPublicPage = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/share(.*)",
  "/shared(.*)",
  "/public/shares(.*)",
]);

export default clerkMiddleware(
  async (auth, request) => {
    if (!isApiRoute(request) && !isPublicPage(request)) {
      await auth.protect();
    }
  },
  {
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
