import mongoose from "mongoose";
import Blocklist from "../models/blocklist.model.js";

// GET /api/blocklist  -> mes commerces bloqués (les plus récents d'abord)
export async function getBlocklist(req, res) {
  const list = await Blocklist.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.status(200).json(list);
}

// DELETE /api/blocklist/:id  -> débloquer un commerce (s'il a bloqué par erreur)
export async function removeFromBlocklist(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const entry = await Blocklist.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) return res.status(404).json({ message: "Not found in your blocklist" });
  res.status(204).send();
}
