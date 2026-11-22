import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { getTranslation } from "../controllers/i18n.controller.js";

const router = Router();

// réservé aux utilisateurs connectés (chaque nouvelle langue coûte un appel à l'IA)
router.post("/:lang", auth, getTranslation);

export default router;
