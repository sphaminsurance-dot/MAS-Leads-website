import type { NextApiRequest, NextApiResponse } from "next";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { boolEnv, validateClientKey } from "../../../lib/admin";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const CLIENTS_TABLE = process.env.CLIENTS_TABLE || "Clients";
const ALLOW_GUILD_REBIND = boolEnv("ALLOW_GUILD_REBIND", false);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientKey = String(req.query.clientKey || "");
  try {
    validateClientKey(clientKey);

    if (req.method === "GET") {
      const out = await doc.send(new GetCommand({ TableName: CLIENTS_TABLE, Key: { client_key: clientKey } }));
      return res.status(200).json({ ok: true, item: out.Item || null });
    }

    if (req.method === "PUT") {
      const body = req.body || {};
      const discord_guild_id = body.discord_guild_id ? String(body.discord_guild_id) : "";
      const discord_webhook_url = body.discord_webhook_url ? String(body.discord_webhook_url) : undefined;
      const close_api_secret_id = body.close_api_secret_id ? String(body.close_api_secret_id) : undefined;
      const active_marker_message_id = body.active_marker_message_id ? String(body.active_marker_message_id) : undefined;

      if (!discord_guild_id) return res.status(400).json({ ok: false, error: "missing_discord_guild_id" });

      // Prevent accidental rebinding
      const existing = await doc.send(new GetCommand({ TableName: CLIENTS_TABLE, Key: { client_key: clientKey } }));
      const oldGuild = existing.Item?.discord_guild_id;
      if (oldGuild && String(oldGuild) !== discord_guild_id && !ALLOW_GUILD_REBIND) {
        return res.status(409).json({ ok: false, error: "guild_rebind_blocked", existing_guild_id: oldGuild });
      }

      const now = new Date().toISOString();

      const names: Record<string, string> = {
        "#dg": "discord_guild_id",
        "#u": "updated_at",
        "#c": "created_at",
      };

      const values: Record<string, any> = {
        ":dg": discord_guild_id,
        ":u": now,
        ":c": now,
      };

      let expr = "SET #dg = :dg, #u = :u, #c = if_not_exists(#c, :c)";

      if (discord_webhook_url) {
        names["#dw"] = "discord_webhook_url";
        values[":dw"] = discord_webhook_url;
        expr += ", #dw = :dw";
      }
      if (close_api_secret_id) {
        names["#cs"] = "close_api_secret_id";
        values[":cs"] = close_api_secret_id;
        expr += ", #cs = :cs";
      }
      if (active_marker_message_id) {
        names["#am"] = "active_marker_message_id";
        values[":am"] = active_marker_message_id;
        expr += ", #am = :am";
      }

      await doc.send(new UpdateCommand({
        TableName: CLIENTS_TABLE,
        Key: { client_key: clientKey },
        UpdateExpression: expr,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }));

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || "error" });
  }
}
