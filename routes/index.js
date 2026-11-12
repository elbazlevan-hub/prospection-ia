import { Router } from "express";
import authRoutes from "./auth.routes.js";
import offerRoutes from "./offer.routes.js";
import leadRoutes from "./lead.routes.js";

const router = Router();

router.use("/auth", authRoutes);    // /api/auth/...
router.use("/offers", offerRoutes); // /api/offers/...
router.use("/leads", leadRoutes);   // /api/leads/...

export default router;
