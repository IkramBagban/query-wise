import { AppShell } from "@/components/AppShell";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
