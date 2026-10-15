"use strict";
// Releases a LOCKED payroll run: makes password-protected payslip PDFs, stores them privately, emails them,
// then marks the run released. Safe to call again: it only does the employees not yet done.
const { guard, res } = require("./lib/common");
const { buildPayslip, monthName } = require("./lib/payslip-pdf");
const BATCH = 20;

async function sendMail({ to, subject, html, filename, pdf }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !process.env.MAIL_FROM) return { skipped: true };
  const r = await fetch("https://api.resend.com/emails", { method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, attachments: [{ filename, content: pdf.toString("base64") }] }) });
  if (!r.ok) return { error: (await r.text()).slice(0, 200) };
  return { ok: true };
}

exports.handler = async (event) => {
  const g = await guard(event, "hr_admin"); if (g.err) return g.err;
  const { admin, userClient } = g;
  try {
    const run_id = JSON.parse(event.body || "{}").run_id; if (!run_id) return res(400, { error: "Missing run." });
    const { data: run } = await admin.from("payroll_runs").select("*").eq("id", run_id).maybeSingle();
    if (!run) return res(404, { error: "Payroll run not found." });
    if (run.status === "released") return res(200, { done: true, remaining: 0, sent: 0, failed: [] });
    if (run.status !== "locked") return res(409, { error: `Payroll must be locked before release (it is ${run.status}).` });

    const [{ data: items }, { data: emps }, { data: priv }, { data: slips }] = await Promise.all([
      admin.from("payroll_items").select("*").eq("run_id", run_id),
      admin.from("employees").select("id,emp_code,full_name,work_email,designation"),
      admin.from("employee_private").select("employee_id,pan"),
      admin.from("payslips").select("employee_id").eq("run_id", run_id),
    ]);
    const pan = (id) => ((priv || []).find((p) => p.employee_id === id) || {}).pan;
    const noPan = (items || []).filter((i) => !pan(i.employee_id)).map((i) => (emps.find((e) => e.id === i.employee_id) || {}).full_name);
    if (noPan.length) return res(422, { error: "PAN is missing for: " + noPan.join(", ") + ". Add it, then release again.", missing: noPan });

    const todo = items.filter((i) => !(slips || []).some((s) => s.employee_id === i.employee_id));
    const batch = todo.slice(0, BATCH), failed = [];
    let sent = 0;
    for (const item of batch) {
      const emp = emps.find((e) => e.id === item.employee_id), file = `${run_id}/${emp.emp_code}.pdf`;
      const pdf = buildPayslip({ company: process.env.COMPANY_NAME || "Company", month: run.month, emp, item, password: pan(emp.id).toUpperCase() });
      const up = await admin.storage.from("payslips").upload(file, pdf, { contentType: "application/pdf", upsert: true });
      if (up.error) { failed.push({ name: emp.full_name, error: up.error.message }); continue; }
      const mail = await sendMail({ to: emp.work_email, subject: "Payslip for " + monthName(run.month),
        html: `<p>Hello ${emp.full_name},</p><p>Your payslip for ${monthName(run.month)} is attached. The PDF password is your PAN in capital letters. You can also download it from the HR portal.</p>`,
        filename: `Payslip-${run.month.slice(0, 7)}.pdf`, pdf });
      const row = { run_id, employee_id: emp.id, storage_path: file };
      if (mail.ok) { row.emailed_at = new Date().toISOString(); sent++; }
      if (mail.error) { row.email_error = mail.error; failed.push({ name: emp.full_name, error: "Email failed: " + mail.error }); }
      const w = await admin.from("payslips").upsert(row, { onConflict: "run_id,employee_id" });
      if (w.error) failed.push({ name: emp.full_name, error: w.error.message });
    }
    const remaining = todo.length - batch.length + failed.filter((f) => !/^Email failed/.test(f.error)).length;
    if (remaining === 0) {
      const u = await userClient.from("payroll_runs").update({ status: "released" }).eq("id", run_id).select();
      if (u.error || !(u.data || []).length) return res(400, { error: u.error ? u.error.message : "Could not mark payroll as released." });
    }
    return res(200, { done: remaining === 0, remaining, sent, failed, emailConfigured: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM) });
  } catch (e) {
    return res(500, { error: "Server error while releasing payslips." });
  }
};
