import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import https from "https";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { validateClientKey } from "../../../../lib/admin";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const secrets = new SecretsManagerClient({});

const CLIENTS_TABLE = process.env.CLIENTS_TABLE || "Clients";
const CLOSE_SECRET_PREFIX = process.env.CLOSE_SECRET_PREFIX || "close/";
const CLOSE_CONFIG_ATTR = process.env.CLOSE_CONFIG_ATTR || "close_config";

const REQUIRED_LEAD_CUSTOM_FIELDS = [
  { key: "router_lead_id", name: "Router Lead ID", type: "text" },
  { key: "assigned_agent_id", name: "Assigned Agent ID", type: "text" },
  { key: "assigned_agent_phone", name: "Assigned Agent Phone", type: "text" },
];
const REQUIRED_LEAD_STATUSES = ["New", "Contacted", "Qualified"];
const REQUIRED_OPP_STATUSES = [
  { name: "Active", type: "active" },
  { name: "Won", type: "won" },
  { name: "Lost", type: "lost" },
];

function safeJsonParse(s: string) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
function closeAuthHeader(apiKey: string) {
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}
function httpsJson(hostname: string, method: string, path: string, headers: any, bodyObj: any) {
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const req = https.request(
      { hostname, method, path, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const status = res.statusCode || 0;
          let parsed: any = null;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
          if (status >= 200 && status < 300) return resolve({ status, data: parsed });
          const err: any = new Error(`Close HTTP ${status}`);
          err.status = status;
          err.data = parsed;
          reject(err);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
function closeApi(apiKey: string, method: string, path: string, bodyObj: any) {
  return httpsJson("api.close.com", method, `/api/v1${path}`, { Authorization: closeAuthHeader(apiKey) }, bodyObj);
}

async function getCloseApiKey(client_key: string, clientRow: any) {
  const direct = clientRow?.close_api_secret_id || null;
  const secretId = direct || `${CLOSE_SECRET_PREFIX}${client_key}/apiKey`;
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = out?.SecretString || "";
  const parsed = safeJsonParse(raw);
  if (parsed?.close_api_key) return parsed.close_api_key;
  if (raw.startsWith("api_")) return raw;
  throw new Error(`Missing close_api_key in secret ${secretId}`);
}

async function ensureLeadCustomFields(apiKey: string) {
  const existing = (await closeApi(apiKey, "GET", "/custom_field/lead/?_fields=id,name,type", null)).data || [];
  const byName = new Map(existing.map((f: any) => [String(f.name).toLowerCase(), f]));
  const ids: Record<string, string> = {};
  for (const spec of REQUIRED_LEAD_CUSTOM_FIELDS) {
    const found = byName.get(spec.name.toLowerCase());
    if (found?.id) ids[spec.key] = found.id;
    else {
      const created = (await closeApi(apiKey, "POST", "/custom_field/lead/", { name: spec.name, type: spec.type })).data;
      ids[spec.key] = created.id;
    }
  }
  return ids;
}

async function ensureLeadStatuses(apiKey: string) {
  const existing = (await closeApi(apiKey, "GET", "/status/lead/?_fields=id,label", null)).data || [];
  const byLabel = new Map(existing.map((s: any) => [String(s.label).toLowerCase(), s]));
  const ids: Record<string, string> = {};
  for (const label of REQUIRED_LEAD_STATUSES) {
    const found = byLabel.get(label.toLowerCase());
    if (found?.id) ids[label] = found.id;
    else {
      const created = (await closeApi(apiKey, "POST", "/status/lead/", { label })).data;
      ids[label] = created.id;
    }
  }
  return ids;
}

async function ensurePipelineAndOppStatuses(apiKey: string) {
  const pipelines = (await closeApi(apiKey, "GET", "/pipeline/?_fields=id,name,statuses", null)).data || [];
  const pipeline = pipelines.find((p: any) => String(p.name || "").toLowerCase() === "sales") || pipelines[0];
  if (!pipeline?.id) throw new Error("No Close pipeline found");

  const statuses = (await closeApi(apiKey, "GET", "/status/opportunity/?_fields=id,label,type,pipeline_id", null)).data || [];
  const scoped = statuses.filter((s: any) => String(s.pipeline_id || "") === String(pipeline.id));
  const byKey = new Map(scoped.map((s: any) => [`${String(s.type).toLowerCase()}|${String(s.label).toLowerCase()}`, s]));

  const opp_status_ids: Record<string, string> = {};
  for (const spec of REQUIRED_OPP_STATUSES) {
    const k = `${spec.type}|${spec.name.toLowerCase()}`;
    const found = byKey.get(k);
    if (found?.id) opp_status_ids[spec.type] = found.id;
    else {
      const created = (await closeApi(apiKey, "POST", "/status/opportunity/", { label: spec.name, type: spec.type, pipeline_id: pipeline.id })).data;
      opp_status_ids[spec.type] = created.id;
    }
  }
  return { pipeline_id: pipeline.id, opp_status_ids };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientKey = String(req.query.clientKey || "");
  try {
    validateClientKey(clientKey);
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

    const clientOut = await doc.send(new GetCommand({ TableName: CLIENTS_TABLE, Key: { client_key: clientKey } }));
    const client = clientOut.Item;
    if (!client) return res.status(404).json({ ok: false, error: "client_not_found" });

    const apiKey = await getCloseApiKey(clientKey, client);

    const lead_custom_field_ids = await ensureLeadCustomFields(apiKey);
    const lead_status_ids = await ensureLeadStatuses(apiKey);
    const { pipeline_id, opp_status_ids } = await ensurePipelineAndOppStatuses(apiKey);

    const closeConfig = {
      lead_custom_field_ids,
      lead_status_ids,
      pipeline_id,
      opp_status_ids,
      bootstrapped_at: new Date().toISOString(),
    };

    await doc.send(new UpdateCommand({
      TableName: CLIENTS_TABLE,
      Key: { client_key: clientKey },
      UpdateExpression: "SET #cc = :c, updated_at = :u",
      ExpressionAttributeNames: { "#cc": CLOSE_CONFIG_ATTR },
      ExpressionAttributeValues: { ":c": closeConfig, ":u": new Date().toISOString() },
    }));

    return res.status(200).json({ ok: true, close_config: closeConfig });
  } catch (e: any) {
    return res.status(e?.status || 500).json({ ok: false, error: e?.message || "error", details: e?.data || null });
  }
}
