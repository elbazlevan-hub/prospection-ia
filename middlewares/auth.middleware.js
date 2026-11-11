import jwt from "jsonwebtoken";

// le token JWT est lu dans le cookie "token" (posé au login)
export function auth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId; // l'utilisateur connecté
    next();
  } catch {
    // token faux, modifié ou expiré
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
