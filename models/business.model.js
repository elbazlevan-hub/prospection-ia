import mongoose from "mongoose";

// un commerce trouvé sur Google Places (partagé entre toutes les offres)
const businessSchema = new mongoose.Schema(
  {
    googlePlaceId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    country: { type: String, uppercase: true },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },        // format international : +972...
    website: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    instagram: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 5 },
    language: { type: String, lowercase: true },
    // résultat de l'analyse du site (rempli à l'étape "analyse")
    analysis: {
      hasWebsite: Boolean,
      isOutdated: Boolean,
      whatsappBooking: Boolean,
      onlineBooking: Boolean,
    },
    analyzedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Business", businessSchema);
