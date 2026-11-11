import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { connectDB } from "./lib/connect.js";
import router from "./routes/index.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";

const app = express();
const PORT = process.env.PORT || 3000;

// autorise le front React à appeler l'API en envoyant le cookie
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());   // lire le JSON du body
app.use(cookieParser());   // lire req.cookies (le token JWT est dans un cookie)

app.use("/api", router);

// route inconnue -> 404, puis gestion centrale des erreurs (toujours en dernier)
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`);
  connectDB();
});
