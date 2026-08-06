/**
 * DiscoveryTab.tsx — v3.6.0 "Get discovered"
 *
 * Discovery is now only about being findable: the opt in control, what
 * employers see, findability, and index freshness. Job proposals moved to
 * their own page (ProposalsTab) because deciding on an offer is a different
 * job from tuning your visibility.
 */
import { useEffect, useState } from "react";
import { loadHubSnapshot } from "@/lib/hubSnapshot";
import type { GroupGap } from "@/lib/profileGaps";
import TalentPoolCard from "./TalentPoolCard";

export default function DiscoveryTab({ userId, onOpenProfile }: { userId: string; onOpenProfile: () => void }) {
  const [gaps, setGaps] = useState<GroupGap[]>([]);
  const [pendingIntros, setPendingIntros] = useState(0);

  useEffect(() => {
    loadHubSnapshot(userId)
      .then(s => { setGaps(s.groupGaps); setPendingIntros(s.pendingIntros); })
      .catch(() => { /* silent */ });
  }, [userId]);

  return (
    <div className="space-y-6">
      <TalentPoolCard groupGaps={gaps} pendingIntros={pendingIntros} onOpenProfile={onOpenProfile} />
    </div>
  );
}
