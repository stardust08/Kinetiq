import { Card } from "../../app/components/ui/card";
import { Skeleton } from "../../app/components/ui/skeleton";

export function ServiceSkeleton() {
  return (
    <Card className="p-3">
      <div className="flex gap-3 items-start">
        <div className="flex-1 space-y-3">
          <div>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
          <Skeleton className="h-6 w-24" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <Skeleton className="w-16 h-16 rounded-full flex-shrink-0" />
      </div>
    </Card>
  );
}

export function ServiceSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <ServiceSkeleton key={idx} />
      ))}
    </>
  );
}
