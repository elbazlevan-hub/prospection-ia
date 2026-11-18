import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { sellerProfileSchema } from "../validations/profile.schema.js";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";

const router = Router();

router.use(auth);

router.get("/", getProfile);
router.put("/", validate(sellerProfileSchema), updateProfile);

export default router;
