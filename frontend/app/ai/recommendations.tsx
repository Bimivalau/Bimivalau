import { AIComingSoonScreen } from "@/src/components/AIComingSoon";

export default function AIRecommendations() {
  return (
    <AIComingSoonScreen
      module="recommendations"
      emoji="🎯"
      eyebrow="AI RECOMMENDATIONS"
      title="A style feed made for you"
      description="Personalized daily style picks based on everything you've saved, viewed and searched. The more you use BraidsCommunity, the smarter it gets."
      bullets={[
        "Learns from every save, view and booking",
        "Suggests styles right before events on your calendar",
        "Surfaces new pros trending in your city",
        "Ranks recs by your face shape & lifestyle preferences",
      ]}
      gradient={["#8AB6F9", "#4F72C0", "#2C4A8A"]}
      requiresUnlimited
    />
  );
}
