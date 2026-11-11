import { ZodError } from "zod";

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// middleware d'erreurs = 4 paramètres (err, req, res, next)
export function errorHandler(err, req, res, next) {
  // Zod -> 400 avec des erreurs lisibles
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Validation error",
      errors: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  // JSON mal formé dans Postman
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body" });
  }
  // validation Mongoose / ObjectId invalide
  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({ message: err.message });
  }
  // valeur déjà existante (index unique : email, googlePlaceId...)
  if (err.code === 11000) {
    return res.status(409).json({ message: "Already exists", fields: Object.keys(err.keyValue || {}) });
  }

  console.error(err); // pas de stack trace envoyée au client
  res.status(500).json({ message: "Internal server error" });
}
