import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { getToday, getStats, getInbox } from "../controllers/dashboard.controller.js";

const router = Router();

router.use(auth);

router.get("/today", getToday); // plan du jour : relances + prospects à contacter (?offerId=)
router.get("/stats", getStats); // statistiques et argent gagné (?offerId=)
router.get("/inbox", getInbox); // à répondre, classé par priorité (?offerId=)

export default router;
