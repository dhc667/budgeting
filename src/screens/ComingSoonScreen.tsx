import { EmptyState } from "../ui/Card";

export function ComingSoonScreen({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <EmptyState>Coming soon.</EmptyState>
    </div>
  );
}
