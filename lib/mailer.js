// Envoi d'emails (mot de passe oublié) avec Resend (https://resend.com, gratuit jusqu'à 3 000 emails / mois).
// Sans RESEND_API_KEY dans le .env (en local), l'email est affiché dans le terminal du serveur : pratique pour tester.
export async function sendMail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "AIDY <onboarding@resend.dev>";
  if (!key) {
    console.log(`\n📧 [email non envoyé : pas de RESEND_API_KEY] à ${to}\n   ${subject}\n   ${text}\n`);
    return { sent: false };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!response.ok) {
    console.error("Resend error:", response.status, await response.text().catch(() => ""));
    return { sent: false };
  }
  return { sent: true };
}
