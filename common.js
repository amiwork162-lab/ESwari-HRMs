"use strict";
const { createClient } = require("@supabase/supabase-js");
const res = (code, body) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Checks the caller is a signed-in HR Admin with an MFA session. Returns clients or a ready-made error response.
async function guard(event, role) {
  if (event.httpMethod !== "POST") return { err: res(405, { error: "POST only" }) };
  const token = (event.headers.authorization || "").replace(/^Bearer /i, "");
  if (!token) return { err: res(401, { error: "Not signed in" }) };
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = process.env;
  if (!url || !anon || !svc) return { err: res(500, { error: "Server is missing Supabase settings" }) };
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  const { data: { user } = {}, error } = await admin.auth.getUser(token);
  if (error || !user) return { err: res(401, { error: "Invalid session" }) };
  let aal; try { aal = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).aal; } catch (e) {}
  if (process.env.REQUIRE_MFA !== "false" && aal !== "aal2") return { err: res(403, { error: "MFA required" }) };
  const { data: r } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", role).maybeSingle();
  if (!r) return { err: res(403, { error: "HR Admin only" }) };
  // Acts as the signed-in user, so database security rules and the audit log apply to every write.
  const userClient = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
  return { user, token, admin, userClient };
}
module.exports = { guard, res };
