import { Skeleton } from "../../app/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "../../app/components/ui/card";

export function BookingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <Skeleton className="h-px w-full" />
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BookingSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, idx) => (
        <BookingSkeleton key={idx} />
      ))}
    </div>
  );
}
