import { AIComingSoonScreen } from "@/src/components/AIComingSoon";

export default function AIBusinessCoach() {
  return (
    <AIComingSoonScreen
      module="coach"
      emoji="🤖"
      eyebrow="AI BUSINESS COACH"
      title="Your always-on business partner"
      description="Weekly insights, pricing benchmarks and growth moves — tailored to your city, style mix and clientele."
      bullets={[
        "Your Knotless Braids are your top-performing style",
        "Boho Braids searches jumped 34% in your city",
        "Best day for promotions: Thursday",
        "Competitor average: $180 · your recommended range: $170–185",
        "Upcoming seasonal trends & revenue opportunities",
      ]}
      gradient={["#7CD3B5", "#3C9C86", "#1F5C4E"]}
      requiresUnlimited={false}
    />
  );
}
