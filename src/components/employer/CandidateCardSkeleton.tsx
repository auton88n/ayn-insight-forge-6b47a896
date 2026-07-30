/**
 * CandidateCardSkeleton.tsx — v3.14.0.
 *
 * Clicking Find used to leave the page silent until the match returned. This
 * holds the exact shape of a result card so the layout never jumps.
 */
import { Card } from "@/components/ui/card";

function Bar({ w, h = 10 }: { w: string; h?: number }) {
  return <div className="rounded bg-muted animate-pulse" style={{ width: w, height: h }} />;
}

export default function CandidateCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        <div className="w-14 h-14 rounded-full bg-muted animate-pulse shrink-0" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Bar w="30%" />
          <Bar w="55%" h={14} />
          <Bar w="40%" />
        </div>
      </div>
      <div className="border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-border/60">
        <div className="p-5 space-y-2.5"><Bar w="45%" /><Bar w="80%" /></div>
        <div className="p-5 space-y-2.5"><Bar w="35%" /><Bar w="60%" /></div>
      </div>
      <div className="border-t border-border/60 p-5 space-y-2.5">
        <Bar w="40%" /><Bar w="95%" /><Bar w="85%" />
      </div>
    </Card>
  );
}
