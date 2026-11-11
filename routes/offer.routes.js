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

const router = Router();

router.use(auth); // toutes les routes des offres demandent d'être connecté

router.post("/", validate(offerSchema), createOffer);
router.get("/", getOffers);
router.get("/:id", getOfferById);
router.put("/:id", validate(offerSchema), updateOffer);
router.delete("/:id", deleteOffer);

export default router;
