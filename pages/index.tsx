import { useEffect, useMemo, useState } from "react";

const clients = Array.from({ length: 20 }, (_, i) => `client${i + 1}`);

export default function Home() {
  const [clientKey, setClientKey] = useState(clients[0]);
  const [item, setItem] = useState<any>(null);
  const [form, setForm] = useState<any>({
    discord_guild_id: "",
    discord_webhook_url: "",
    close_api_secret_id: "",
    active_marker_message_id: "",
  });
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setMsg("");
    const r = await fetch(`/api/clients/${clientKey}`);
    const j = await r.json();
    const it = j.item;
    setItem(it);
    setForm({
      discord_guild_id: it?.discord_guild_id || "",
      discord_webhook_url: it?.discord_webhook_url || "",
      close_api_secret_id: it?.close_api_secret_id || "",
      active_marker_message_id: it?.active_marker_message_id || "",
    });
  }

  useEffect(() => { load(); }, [clientKey]);

  async function save() {
    setMsg("");
    const r = await fetch(`/api/clients/${clientKey}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        discord_guild_id: form.discord_guild_id,
        discord_webhook_url: form.discord_webhook_url || undefined,
        close_api_secret_id: form.close_api_secret_id || undefined,
        active_marker_message_id: form.active_marker_message_id || undefined,
      }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(`Save failed: ${j.error}`);
    setMsg("Saved ✅");
    await load();
  }

  async function bootstrap() {
    setMsg("");
    const r = await fetch(`/api/clients/${clientKey}/bootstrap`, { method: "POST" });
    const j = await r.json();
    if (!r.ok) return setMsg(`Bootstrap failed: ${j.error}`);
    setMsg("Bootstrapped Close ✅");
    await load();
  }

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Client Onboarding</h1>

      <label>Client</label>
      <select value={clientKey} onChange={(e) => setClientKey(e.target.value)} style={{ width: "100%", padding: 10 }}>
        {clients.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <Field label="discord_guild_id (required)" value={form.discord_guild_id} onChange={(v) => setForm({ ...form, discord_guild_id: v })} />
        <Field label="discord_webhook_url (optional)" value={form.discord_webhook_url} onChange={(v) => setForm({ ...form, discord_webhook_url: v })} />
        <Field label="close_api_secret_id (optional override)" value={form.close_api_secret_id} onChange={(v) => setForm({ ...form, close_api_secret_id: v })} />
        <Field label="active_marker_message_id (optional)" value={form.active_marker_message_id} onChange={(v) => setForm({ ...form, active_marker_message_id: v })} />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
        <button onClick={save} style={{ padding: "10px 14px" }}>Save</button>
        <button onClick={bootstrap} style={{ padding: "10px 14px" }}>Bootstrap Close</button>
      </div>

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}

      <pre style={{ marginTop: 18, padding: 12, background: "#f6f6f6", overflow: "auto" }}>
        {JSON.stringify(item, null, 2)}
      </pre>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ marginBottom: 6 }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: 10 }} />
    </div>
  );
}
