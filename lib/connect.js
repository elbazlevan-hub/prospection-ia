import mongoose from "mongoose";

// Fix réseau : si le DNS du réseau bloque "mongodb+srv" (erreur querySrv ENOTFOUND),
// on récupère les adresses du cluster via HTTPS (dns.google) et on construit une URL "mongodb://" classique.
async function buildStandardUrl(srvUrl) {
  const u = new URL(srvUrl);
  const host = u.hostname;
  const ask = async (name, type) => {
    for (const url of [
      `https://dns.google/resolve?name=${name}&type=${type}`,
      `https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`,
    ]) {
      try {
        const r = await fetch(url, { headers: { accept: "application/dns-json" } });
        const ans = (await r.json()).Answer;
        if (ans && ans.length) return ans;
      } catch {}
    }
    return [];
  };
  const srv = await ask(`_mongodb._tcp.${host}`, "SRV");
  let hosts = srv
    .filter((a) => a.type === 33)
    .map((a) => {
      const [, , port, target] = a.data.split(" ");
      return `${target.replace(/\.$/, "")}:${port}`;
    });
  // secours : noms standards des serveurs Atlas (cluster0.xxx -> cluster0-shard-00-0N.xxx)
  if (hosts.length === 0) {
    const [name, ...rest] = host.split(".");
    hosts = [0, 1, 2].map((i) => `${name}-shard-00-0${i}.${rest.join(".")}:27017`);
  }
  const txtAns = (await ask(host, "TXT")).filter((a) => a.type === 16);
  const txt = txtAns.length ? txtAns.map((a) => a.data.replace(/"/g, "")).join("&") : "authSource=admin";
  const params = new URLSearchParams(u.search);
  for (const [k, v] of new URLSearchParams(txt)) if (!params.has(k)) params.set(k, v);
  params.set("tls", "true");
  const auth = u.username ? `${u.username}:${u.password}@` : "";
  return `mongodb://${auth}${hosts.join(",")}${u.pathname || "/"}?${params.toString()}`;
}

export async function connectDB() {
  const database = mongoose.connection;

  database.on("error", (error) => {
    console.log("database connection error: ", error.message);
  });

  database.once("open", () => {
    console.log("connect to the database");
  });

  try {
    await mongoose.connect(process.env.DATABASE_URL);
  } catch (error) {
    if (error.code === "ENOTFOUND" || error.syscall === "querySrv" || error.code === "ECONNREFUSED") {
      console.log("DNS SRV bloqué -> connexion avec l'URL standard...");
      try {
        await mongoose.connect(await buildStandardUrl(process.env.DATABASE_URL));
      } catch (err) {
        console.log("database connection error: ", err.message);
      }
    } else {
      console.log("database connection error: ", error.message);
    }
  }
}
