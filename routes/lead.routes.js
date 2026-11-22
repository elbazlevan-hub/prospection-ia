import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { updateLeadSchema, contactLeadSchema, blockLeadSchema, replySchema, replySentSchema } from "../validations/lead.schema.js";
import { getLead, updateLead, contactLead, blockLead, unlockLead, replyToLead, replySent, reportBadPhone } from "../controllers/lead.controller.js";
import { regenerateLeadMessage } from "../controllers/message.controller.js";

const router = Router();

router.use(auth); // toutes les routes des prospects demandent d'être connecté

router.get("/:id", getLead);                                          // prospect + message + liens d'envoi
router.patch("/:id", validate(updateLeadSchema), updateLead);         // statut, notes, montant
router.post("/:id/contact", validate(contactLeadSchema), contactLead); // message ou relance envoyé
router.post("/:id/block", validate(blockLeadSchema), blockLead);       // ne plus jamais contacter
router.post("/:id/message", regenerateLeadMessage);                    // (ré)écrire le message IA
router.post("/:id/unlock", unlockLead);                                // débloquer (1 crédit) + message AIDY
router.post("/:id/bad-phone", reportBadPhone);                          // le numéro ne marche pas (crédit rendu sous conditions)
router.post("/:id/reply", validate(replySchema), replyToLead);         // Premium : AIDY classe la réponse et écrit la sienne
router.post("/:id/reply/sent", validate(replySentSchema), replySent);  // la réponse a été envoyée

export default router;
