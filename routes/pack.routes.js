import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { getPacks, buyPack } from "../controllers/pack.controller.js";

const router = Router();

router.use(auth);

router.get("/", getPacks);
router.post("/:id/buy", buyPack); // paiement de démonstration

export default router;
