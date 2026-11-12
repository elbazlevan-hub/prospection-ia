import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { getLead, regenerateLeadMessage } from "../controllers/message.controller.js";

const router = Router();

router.use(auth); // toutes les routes des prospects demandent d'être connecté

router.get("/:id", getLead);
router.post("/:id/message", regenerateLeadMessage); // (ré)écrire le message IA

export default router;
