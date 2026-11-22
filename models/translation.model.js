import mongoose from "mongoose";

// traduction de l'interface dans une langue (faite une fois par l'IA, puis gardée)
const translationSchema = new mongoose.Schema(
  {
    lang: { type: String, required: true },   // code de langue : de, he, ar, pt-BR...
    hash: { type: String, required: true },   // empreinte des textes anglais traduits (nouvelle traduction s'ils changent)
    dict: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

translationSchema.index({ lang: 1, hash: 1 }, { unique: true });

export default mongoose.model("Translation", translationSchema);
