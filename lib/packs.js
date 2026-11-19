// Les packs (paiement unique). 1 crédit = 1 commerce débloqué avec son message AIDY.
export const PACKS = [
  { id: "standard", credits: 60, price: 29, currency: "USD", plan: "paid" },
  { id: "premium", credits: 120, price: 49, currency: "USD", plan: "premium" }, // + assistant de réponse
  { id: "recharge", credits: 30, price: 17, currency: "USD", plan: null, needsPack: true }, // après un 1er pack
];

export const findPack = (id) => PACKS.find((p) => p.id === id);
