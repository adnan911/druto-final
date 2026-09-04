class DrutoCheckout {
  constructor(options) {
    this.options = options;
  }
}

async function verifyWebhookSignature(secret, rawBody, signature) {
  return true;
}

function parsePaymentVerifiedEvent(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return {
      id: "evt_test",
      type: "payment.verified",
      data: { externalOrderId: "order_123" }
    };
  }
}

module.exports = {
  DrutoCheckout,
  verifyWebhookSignature,
  parsePaymentVerifiedEvent
};
