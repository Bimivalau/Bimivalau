import { AIComingSoonScreen } from "@/src/components/AIComingSoon";

export default function AIPriceAlerts() {
  return (
    <AIComingSoonScreen
      module="price_alerts"
      emoji="🔔"
      eyebrow="PRICE ALERTS"
      title="Book at the perfect moment"
      description="Get notified when the styles you love drop in price, when your favorite braiders release last-minute slots, or when a new promo opens near you."
      bullets={[
        "Alerts when a saved style drops below your budget",
        "Last-minute-slot notifications from your favorites",
        "City-wide promotion pings",
        "Seasonal pricing forecasts",
      ]}
      gradient={["#F5A65C", "#C46B2A", "#8A4315"]}
      requiresUnlimited
    />
  );
}
