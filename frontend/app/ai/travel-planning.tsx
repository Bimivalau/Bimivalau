import { AIComingSoonScreen } from "@/src/components/AIComingSoon";

export default function AITravelPlanning() {
  return (
    <AIComingSoonScreen
      module="travel_planning"
      emoji="✈️"
      eyebrow="TRAVEL PLANNING"
      title="A braider in every city you visit"
      description="Planning a trip? Travel Planning finds the best braiders at your destination, blocks time in your itinerary, and even books your takedown before you fly home."
      bullets={[
        "Curated braider shortlists by city",
        "Automatic scheduling around your travel dates",
        "Local Style Score forecasts wherever you go",
        "Takedown & touch-up planning built in",
      ]}
      gradient={["#9DD9E3", "#4A9BB8", "#1F5673"]}
      requiresUnlimited
    />
  );
}
