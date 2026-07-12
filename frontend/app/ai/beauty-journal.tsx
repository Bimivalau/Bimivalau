import { AIComingSoonScreen } from "@/src/components/AIComingSoon";

export default function AIBeautyJournal() {
  return (
    <AIComingSoonScreen
      module="beauty_journal"
      emoji="📓"
      eyebrow="BEAUTY JOURNAL"
      title="Your braid history, curated"
      description="Track every style, every takedown, every touch-up. Beauty Journal keeps a private timeline of your hair — perfect for planning, and beautiful to look back on."
      bullets={[
        "Auto-log each booking with photos & notes",
        "See what worked (and what didn't) at a glance",
        "Set reminders for takedowns & touch-ups",
        "Share select memories with your braider",
      ]}
      gradient={["#D0B0F5", "#8459C9", "#4E2E86"]}
      requiresUnlimited
    />
  );
}
