import { Skeleton } from "../../app/components/ui/skeleton";

export function CategorySkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-square rounded-xl" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

export function CategorySkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <CategorySkeleton key={idx} />
      ))}
    </>
  );
}
