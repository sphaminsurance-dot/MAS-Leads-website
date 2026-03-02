import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");
      window.location.href = "/";
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>MAS Leads Admin</h1>
      <p>Enter admin password to continue.</p>
      <form onSubmit={onSubmit}>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Admin password"
          style={{ width: "100%", padding: 12, fontSize: 16 }}
        />
        <button disabled={loading} style={{ width: "100%", padding: 12, marginTop: 12, fontSize: 16 }}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {err && <div style={{ marginTop: 12, color: "crimson" }}>{err}</div>}
      </form>
    </div>
  );
}
