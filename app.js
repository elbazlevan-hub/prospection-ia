import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./lib/connect.js";
import router from "./routes/index.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";

const app = express();
const PORT = process.env.PORT || 3000;

// en ligne (Render, Railway...) le serveur est derrière un proxy : req.ip = la vraie IP du visiteur (anti-abus)
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// autorise le front React à appeler l'API en envoyant le cookie
// CLIENT_URL peut contenir plusieurs adresses séparées par des virgules (ex. localhost + le site en ligne)
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((u) => u.trim().replace(/\/$/, ""));
app.use(helmet()); // règles de sécurité automatiques sur chaque réponse (en-têtes HTTP)
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "200kb" }));   // lire le JSON du body
app.use(cookieParser());   // lire req.cookies (le token JWT est dans un cookie)

app.use("/api", router);

// route inconnue -> 404, puis gestion centrale des erreurs (toujours en dernier)
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`);
  connectDB();
});
