import { AIComingSoonScreen } from "@/src/components/AIComingSoon";

export default function AIStyleMatch() {
  return (
    <AIComingSoonScreen
      module="style_match"
      emoji="✨"
      eyebrow="AI STYLE MATCH"
      title="Find your perfect braid"
      description="Upload a selfie and let our AI recommend the braid styles that suit your face shape, hair length, lifestyle and mood."
      bullets={[
        "Reads face shape, hair length & density from your selfie",
        "Weighs lifestyle, occasion, maintenance & budget",
        "Ranks the top braid styles just for you",
        "Then instantly matches you with braiders who nail them",
      ]}
      gradient={["#F5C77E", "#B78141", "#8B5A2B"]}
      requiresUnlimited
    />
  );
}
