import { Router } from "express";
import { register, login, logout, me, forgotPassword, resetPassword } from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { auth } from "../middlewares/auth.middleware.js";
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "../validations/auth.schema.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", auth, me); // protégée
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword); // lien par email
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);     // nouveau mot de passe

export default router;
