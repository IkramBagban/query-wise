import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QueryWise Admin",
  description: "Operator panel for QueryWise (private deployment).",
  robots: { index: false, follow: false },
};

// Auth + allowlist are request-scoped; never statically prerender admin routes.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", inter.variable, "font-sans", geist.variable)}>
      <body className="min-h-screen font-sans antialiased">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
