import mongoose from "mongoose";

// un achat de pack (historique des paiements)
const purchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    packId: { type: String, enum: ["standard", "premium", "recharge", "job"], required: true },
    credits: { type: Number, min: 0, required: true },
    price: { type: Number, min: 0, required: true },
    currency: { type: String, required: true },
    demo: { type: Boolean, default: true }, // true = paiement de démonstration (pas encore de vrai paiement)
  },
  { timestamps: true }
);

export default mongoose.model("Purchase", purchaseSchema);
