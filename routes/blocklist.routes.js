import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { getBlocklist, removeFromBlocklist } from "../controllers/blocklist.controller.js";

const router = Router();

router.use(auth);

router.get("/", getBlocklist);
router.delete("/:id", removeFromBlocklist);

export default router;
