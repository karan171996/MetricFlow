import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

/** Shared "No data yet" / error card for every /performance view. */
export function EmptyState({
  title = "No data yet",
  reason = "Keys work, but no page events have arrived.",
  href = "/connect",
  cta = "Send your first events",
  onRetry,
}: {
  title?: string;
  reason?: string;
  /** `null` = no link, e.g. a failed load where Retry is the only thing to do. */
  href?: string | null;
  cta?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="max-w-md text-sm text-gray-400">{reason}</p>
        <div className="flex gap-3">
          {href && (
            <Link href={href} className={buttonVariants()}>
              {cta}
            </Link>
          )}
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
