export default async function PaidPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <main style={{ maxWidth: 720, margin: "80px auto", padding: 24, fontFamily: "system-ui" }}>
    <p style={{ color: "#148a76", fontWeight: 700, letterSpacing: ".08em" }}>DRUTO RETURN</p>
    <h1>Payment review for {orderId}</h1>
    <p>Your customer has returned from hosted checkout. Load the order status from your backend and show fulfillment only after the verified webhook or trusted Druto status confirms success.</p>
  </main>;
}
