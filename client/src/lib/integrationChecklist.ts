type Account = { id: string; status: string; walletVerifiedAt: Date | string | null; receivingAddress: string };
type Key = { merchantAccountId: string | null; revokedAt: Date | string | null };
type Endpoint = { id: string; merchantAccountId: string | null; active: number };
type Intent = { id: string; merchantAccountId: string | null; status: string };
type Transfer = { paymentIntentId: string; toAddress: string };
export type IntegrationState = "complete" | "action" | "unknown" | "blocked";
export type IntegrationStep = { id: string; title: string; state: IntegrationState; detail: string; action: string; target: string };
export function integrationChecklist(input: {
  account?: Account; keys: Key[]; endpoints: Endpoint[]; intents: Intent[]; transfers: Transfer[];
  endpointId?: string; delivered?: number;
  known: { accounts: boolean; keys: boolean; payments: boolean; deliveries: boolean };
}): IntegrationStep[] {
  const { account, known } = input;
  const wallet = !!account && account.status === "active" && !!account.walletVerifiedAt;
  const key = !!account && input.keys.some(row => row.merchantAccountId === account.id && !row.revokedAt);
  const endpoint = !!account && input.endpoints.some(row => row.id === input.endpointId && row.merchantAccountId === account.id && row.active === 1);
  const intents = new Set(input.intents.filter(row => row.merchantAccountId === account?.id && row.status === "succeeded").map(row => row.id));
  const paid = !!account && input.transfers.some(row => intents.has(row.paymentIntentId) && row.toAddress.toLowerCase() === account.receivingAddress.toLowerCase());
  const state = (readable: boolean, completed: boolean, prerequisite = true): IntegrationState =>
    !readable ? "unknown" : !prerequisite ? "blocked" : completed ? "complete" : "action";
  return [
    { id:"wallet", title:"Verify the seller receiving wallet", state:state(known.accounts,wallet),
      detail:wallet ? "Active seller with a recorded wallet ownership proof." : "Register this seller and complete its receiving-wallet signature. This is not identity verification.",
      action:"Open seller setup",target:"Sellers" },
    { id:"key",title:"Issue a seller-scoped server key",state:state(known.accounts && known.keys,key,wallet),
      detail:key ? "An unrevoked key is linked to this seller. This does not prove it is installed in your server." : "Create a key for this verified seller and save it in your backend secret store.",
      action:"Manage API keys",target:"API Keys" },
    { id:"endpoint",title:"Configure an active webhook endpoint",state:state(known.accounts,endpoint,wallet),
      detail:endpoint ? "The selected endpoint is registered and active." : "Register an HTTPS endpoint for this seller; its exact origin must be enabled by the operator.",
      action:"Manage webhooks",target:"Webhooks" },
    { id:"payment",title:"Record a verified Testnet payment",state:state(known.accounts && known.payments,paid,wallet),
      detail:paid ? "A succeeded intent has a transfer record to this seller's current receiving address." : "Create checkout from your storefront backend and complete a small Arc Testnet payment.",
      action:"Review payments",target:"Payments" },
    { id:"event",title:"Observe endpoint acknowledgement",state:state(known.accounts && (endpoint ? known.deliveries : true),endpoint && (input.delivered ?? 0)>0,wallet && endpoint),
      detail:endpoint && (input.delivered ?? 0)>0 ? "This endpoint acknowledged an event. HTTP success does not prove signature verification or fulfillment." : "Inspect the delivery log after a verified payment. A valid signed event must be accepted durably by your receiver.",
      action:"Inspect delivery log",target:"Webhooks" },
  ];
}