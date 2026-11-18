import User from "../models/user.model.js";
import Purchase from "../models/purchase.model.js";
import { PACKS, findPack } from "../lib/packs.js";

// GET /api/packs  -> les packs à vendre + mes crédits
export async function getPacks(req, res) {
  const user = await User.findById(req.userId);
  const purchases = await Purchase.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.status(200).json({ packs: PACKS, plan: user.plan, credits: user.credits, purchases });
}

// POST /api/packs/:id/buy  -> achète un pack (paiement de DÉMONSTRATION : aucun vrai paiement)
// plus tard : cette route sera appelée par Stripe une fois le paiement validé
export async function buyPack(req, res) {
  const pack = findPack(req.params.id);
  if (!pack) return res.status(404).json({ message: "Pack not found" });

  const user = await User.findById(req.userId);
  // la recharge est réservée à ceux qui ont déjà un pack
  if (pack.needsPack && user.plan === "free") {
    return res.status(400).json({ message: "The recharge is for users who already bought a pack" });
  }

  user.credits += pack.credits;
  if (pack.plan === "premium") user.plan = "premium";
  else if (pack.plan === "paid" && user.plan === "free") user.plan = "paid"; // un Premium ne redescend pas en Standard
  await user.save();

  const purchase = await Purchase.create({
    userId: user._id,
    packId: pack.id,
    credits: pack.credits,
    price: pack.price,
    currency: pack.currency,
    demo: true,
  });

  res.status(201).json({ purchase, plan: user.plan, credits: user.credits });
}
