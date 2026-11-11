import mongoose from "mongoose";

// ce que l'utilisateur vend aux commerces + qui il veut cibler
export const CRITERIA = ["noWebsite", "oldWebsite", "whatsappBooking", "noOnlineBooking", "lowRating"];

const offerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    serviceType: { type: String, required: true, trim: true },          // site, photo, marketing...
    targetCategories: { type: [String], required: true },               // barber, nail salon...
    targetCountry: { type: String, required: true, uppercase: true },   // code ISO : IL, FR...
    targetCity: { type: String, trim: true },
    criteria: { type: [String], enum: CRITERIA, required: true },       // problèmes recherchés
    messageLanguage: { type: String, required: true, lowercase: true }, // he, fr, en...
  },
  { timestamps: true }
);

export default mongoose.model("Offer", offerSchema);
