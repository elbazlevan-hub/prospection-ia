import mongoose from "mongoose";
import Offer, { citiesOf } from "../models/offer.model.js";
import Lead from "../models/lead.model.js";
import { mobileOnly } from "../lib/phone.js";

// une cellule CSV : on entoure de guillemets si besoin
function cell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// GET /api/offers/:id/export  -> fichier CSV des prospects (s'ouvre dans Excel)
// ?contacts=true -> seulement Nom, Téléphone, Email (et seulement ceux qui ont un contact)
export async function exportLeadsCsv(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id" });
  }
  const offer = await Offer.findOne({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  const leads = await Lead.find({ offerId: offer._id, userId: req.userId })
    .populate("businessId")
    .sort({ score: -1, createdAt: -1 });

  const contactsOnly = req.query.contacts === "true";
  // sécurité : jamais de fixe dans l'export, même pour d'anciennes données
  const mobile = (b) => mobileOnly(b.phone, b.country);

  const header = ["Name", "Category", "City", "Phone", "Email", "Instagram", "Website", "Rating", "Reviews", "Score", "Reasons", "Status", "Contacted via", "Contacted at", "Next follow-up", "Deal value", "Notes", "Email subject", "Message"];
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const rows = leads
    .filter((l) => l.businessId)
    .map((l) => {
      const b = l.businessId;
      return [b.name, b.category, b.city, mobile(b), b.email, b.instagram, b.website, b.rating, b.reviewCount, l.score, l.matchReasons.join(", "), l.status, l.contactedVia, day(l.contactedAt), day(l.followUpAt), l.dealValue, l.notes, l.emailSubject, l.message];
    });

  // version simple : nom / téléphone / email
  const table = contactsOnly
    ? [
        ["Name", "Phone", "Email"],
        ...leads
          .filter((l) => l.businessId && (mobile(l.businessId) || l.businessId.email))
          .map((l) => [l.businessId.name, mobile(l.businessId), l.businessId.email]),
      ]
    : [header, ...rows];

  // ";" + BOM UTF-8 = Excel (version française) ouvre le fichier correctement, avec les accents
  const csv = "\uFEFF" + table.map((r) => r.map(cell).join(";")).join("\r\n");
  const fileName = `${contactsOnly ? "contacts" : "leads"}-${(citiesOf(offer).join("-") || offer.targetCountry).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.status(200).send(csv);
}
