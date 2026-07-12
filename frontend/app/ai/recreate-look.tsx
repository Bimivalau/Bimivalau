import { AIComingSoonScreen } from "@/src/components/AIComingSoon";

export default function AIRecreateLook() {
  return (
    <AIComingSoonScreen
      module="recreate_look"
      emoji="🪄"
      eyebrow="RECREATE THIS LOOK"
      title="Bring any braid from Instagram to your chair"
      description="Drop in a hairstyle you saw online. AI identifies the closest matches in our catalogue and pairs you with braiders who can recreate it."
      bullets={[
        "Works with Instagram, TikTok, Pinterest & camera roll photos",
        "Detects style category, length, technique & finish",
        "Surfaces matching styles inside BraidsCommunity",
        "Recommends nearby braiders with proven portfolio matches",
      ]}
      gradient={["#EA80B7", "#B5477D", "#7E2A5A"]}
      requiresUnlimited
    />
  );
}
