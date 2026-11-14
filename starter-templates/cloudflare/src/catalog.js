// Server-owned catalog. Prices are integer USDC atomic units (six decimals).
// These are demo products; this starter does not deliver digital goods.
export const catalog = [
  { id:'orbit', title:'Orbit collection', category:'Digital objects', description:'A study in light, form and quiet movement.', amountAtomic:'2000000', edition:'01', art:'orbit' },
  { id:'terrain', title:'Terrain studies', category:'Visual explorations', description:'Sculptural landscapes. A different perspective.', amountAtomic:'3000000', edition:'02', art:'terrain' },
  { id:'ribbon', title:'Ribbon system', category:'Design resources', description:'Fluid shapes for ideas that deserve room.', amountAtomic:'5000000', edition:'03', art:'ribbon' },
];
export function decimal(atomic) {
  const amount=BigInt(atomic);
  return `${amount/1000000n}.${(amount%1000000n).toString().padStart(6,'0')}`;
}
