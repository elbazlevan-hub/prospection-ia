import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    language: { type: String, default: "en", lowercase: true },  // langue de l'interface
    country: { type: String, uppercase: true },                  // code ISO : US, FR, GB...
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
