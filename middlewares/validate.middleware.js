// vérifie req.body avec un schéma Zod ; si erreur -> le error middleware renvoie 400
export const validate = (schema) => (req, res, next) => {
  req.body = schema.parse(req.body ?? {}); // garde seulement les champs connus du schéma
  next();
};
