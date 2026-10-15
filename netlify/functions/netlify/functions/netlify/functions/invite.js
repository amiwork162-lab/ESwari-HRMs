// Sends login invites. Only a signed-in HR Admin with an MFA session may call it.
const { createClient } = require("@supabase/supabase-js");
const res = (code, body) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return res(405, { error: "POST only" });
  try {
    const token = (event.headers.authorization || "").replace(/^Bearer /i, "");
    if (!token) return res(401, { error: "Not signed in" });
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error } = await admin.auth.getUser(token); // verifies the token with Supabase
    if (error || !user) return res(401, { error: "Invalid session" });
    const aal = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).aal;
    if (process.env.REQUIRE_MFA !== "false" && aal !== "aal2") return res(403, { error: "MFA required" });
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "hr_admin").maybeSingle();
    if (!role) return res(403, { error: "HR Admin only" });

    const ids = (JSON.parse(event.body || "{}").employee_ids || []).slice(0, 100);
    const { data: emps } = await admin.from("employees").select("id,work_email,user_id").in("id", ids);
    const results = [];
    for (const e of emps || []) {
      if (e.user_id) { results.push({ id: e.id, ok: false, error: "Already has a login" }); continue; }
      const { data, error: err } = await admin.auth.admin.inviteUserByEmail(e.work_email, { redirectTo: process.env.SITE_URL });
      if (err) { results.push({ id: e.id, ok: false, error: err.message }); continue; }
      const { error: ue } = await admin.from("employees").update({ user_id: data.user.id }).eq("id", e.id);
      results.push({ id: e.id, ok: !ue, error: ue ? ue.message : undefined });
    }
    return res(200, { results });
  } catch (e) {
    return res(500, { error: "Server error" });
  }
};
