import { Router } from "express";
import authRoutes from "./auth.routes.js";
import offerRoutes from "./offer.routes.js";
import leadRoutes from "./lead.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import blocklistRoutes from "./blocklist.routes.js";
import profileRoutes from "./profile.routes.js";
import packRoutes from "./pack.routes.js";
import i18nRoutes from "./i18n.routes.js";

const router = Router();

router.use("/auth", authRoutes);           // /api/auth/...
router.use("/offers", offerRoutes);        // /api/offers/...
router.use("/leads", leadRoutes);          // /api/leads/...
router.use("/dashboard", dashboardRoutes); // /api/dashboard/today, /stats
router.use("/blocklist", blocklistRoutes); // /api/blocklist
router.use("/profile", profileRoutes);     // /api/profile (fiche infos du vendeur)
router.use("/packs", packRoutes);          // /api/packs (packs Standard / Premium / Recharge)
router.use("/i18n", i18nRoutes);           // /api/i18n/:lang (l'app dans toutes les langues, traduite par l'IA)

export default router;
