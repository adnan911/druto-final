import { PayWithDrutoButton } from "../components/PayWithDrutoButton";

export default function HomePage() {
  return <main style={{ maxWidth: 720, margin: "80px auto", padding: 24, fontFamily: "system-ui" }}>
    <p style={{ color: "#148a76", fontWeight: 700, letterSpacing: ".08em" }}>ARC TESTNET · USDC</p>
    <h1>Dashda checkout starter</h1>
    <p>Create the Payment Intent on your server, then let Druto handle wallet or QR checkout.</p>
    <PayWithDrutoButton
      orderId="order_demo_123"
      itemName="Dashda jacket × 1"
      amount="25.00"
      buyerEmail="buyer@example.com"
      marketplaceId="dashda"
      sellerId="dashda-main"
    />
  </main>;
}
