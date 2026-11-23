// Les packs (paiement unique). 1 crédit = 1 commerce débloqué avec son message AIDY.
export const PACKS = [
  { id: "standard", credits: 60, price: 29, currency: "USD", plan: "paid" },
  { id: "premium", credits: 120, price: 49, currency: "USD", plan: "premium" }, // + assistant de réponse
  { id: "recharge", credits: 30, price: 19, currency: "USD", plan: null, needsPack: true }, // après un 1er pack
  // chercheurs d'emploi : 50 candidatures. 25 $ -> environ 23 $ reçus après les frais de paiement (~5 % + 0,50 $)
  // ses crédits ne servent QUE pour chercher un emploi (offre « Je cherche un emploi ») : impossible de s'en servir pour vendre
  { id: "job", credits: 50, price: 25, currency: "USD", plan: "job", creditType: "job" },
];

export const findPack = (id) => PACKS.find((p) => p.id === id);
