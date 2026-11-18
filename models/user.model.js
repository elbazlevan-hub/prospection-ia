import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    language: { type: String, default: "en", lowercase: true },  // langue de l'interface
    country: { type: String, uppercase: true },                  // code ISO : US, FR, GB...
    // essai gratuit puis packs payants (paiement unique)
    plan: { type: String, enum: ["free", "paid"], default: "free" },
    credits: { type: Number, min: 0, default: 5 },              // prospects qu'il peut encore débloquer (5 offerts)
    freeSearchUsed: { type: Boolean, default: false },           // essai gratuit : 1 seule recherche
  },
  { timestamps: true } // createdAt + updatedAt
);

// ne jamais renvoyer passwordHash au client
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("User", userSchema);
