import User from "../models/user.model.js";

// GET /api/profile  -> ma fiche infos (prix, délais, liens...)
export async function getProfile(req, res) {
  const user = await User.findById(req.userId);
  res.status(200).json({ plan: user.plan, credits: user.credits, sellerProfile: user.toObject().sellerProfile || {} });
}

// PUT /api/profile  -> remplacer ma fiche infos (body validé par Zod)
export async function updateProfile(req, res) {
  const user = await User.findById(req.userId);
  user.sellerProfile = req.body;
  await user.save();
  res.status(200).json({ plan: user.plan, credits: user.credits, sellerProfile: user.toObject().sellerProfile });
}
