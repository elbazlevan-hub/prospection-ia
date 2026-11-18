import mongoose from "mongoose";

// commerces à ne plus JAMAIS contacter (ils ont dit "stop" ou "non merci")
// propre à chaque utilisateur ; vérifié à chaque recherche et avant chaque envoi
const blocklistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
    googlePlaceId: { type: String, required: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    reason: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// un commerce n'est bloqué qu'une fois par utilisateur
blocklistSchema.index({ userId: 1, googlePlaceId: 1 }, { unique: true });

export default mongoose.model("Blocklist", blocklistSchema);

// les commerces bloqués d'un utilisateur, pour filtrer vite
export async function blockedSetOf(userId) {
  const list = await mongoose.model("Blocklist").find({ userId }).lean();
  const set = new Set();
  for (const b of list) {
    set.add(b.googlePlaceId);
    if (b.phone) set.add(b.phone);
    if (b.email) set.add(b.email);
  }
  return set;
}

export function isBlocked(business, blockedSet) {
  return (
    blockedSet.has(business.googlePlaceId) ||
    (business.phone && blockedSet.has(business.phone)) ||
    (business.email && blockedSet.has(business.email.toLowerCase()))
  );
}
