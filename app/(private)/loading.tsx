import { LoadingState } from "@/components/v2/ResourceState";

export default function Loading() {
  return <div className="p-4 sm:p-6"><LoadingState label="Loading workspace" /></div>;
}
