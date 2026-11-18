import { Router } from "express";
import authRoutes from "./auth.routes.js";
import offerRoutes from "./offer.routes.js";
import leadRoutes from "./lead.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import blocklistRoutes from "./blocklist.routes.js";

const router = Router();

router.use("/auth", authRoutes);           // /api/auth/...
router.use("/offers", offerRoutes);        // /api/offers/...
router.use("/leads", leadRoutes);          // /api/leads/...
router.use("/dashboard", dashboardRoutes); // /api/dashboard/today, /stats
router.use("/blocklist", blocklistRoutes); // /api/blocklist

export default router;
