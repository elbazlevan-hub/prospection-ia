import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { offerSchema } from "../validations/offer.schema.js";
import {
  createOffer,
  getOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
} from "../controllers/offer.controller.js";
import { searchBusinesses, getOfferLeads } from "../controllers/search.controller.js";

const router = Router();

router.use(auth); // toutes les routes des offres demandent d'être connecté

router.post("/", validate(offerSchema), createOffer);
router.get("/", getOffers);
router.get("/:id", getOfferById);
router.put("/:id", validate(offerSchema), updateOffer);
router.delete("/:id", deleteOffer);

router.post("/:id/search", searchBusinesses); // lance la recherche Google
router.get("/:id/leads", getOfferLeads);      // les prospects trouvés

export default router;
