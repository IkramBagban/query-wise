import { AppShell } from "@/components/v2/AppShell";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
