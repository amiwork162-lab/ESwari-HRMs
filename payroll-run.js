"use strict";
// Calculates (or recalculates) a DRAFT payroll run for a month. Runs as the signed-in HR user.
const { guard, res } = require("./lib/common");
const P = require("./lib/payroll");

exports.handler = async (event) => {
  const g = await guard(event, "hr_admin"); if (g.err) return g.err;
  const db = g.userClient;
  try {
    const month = (JSON.parse(event.body || "{}").month || "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res(400, { error: "Choose a month." });
    const mStart = month + "-01", dim = P.daysInMonth(+month.slice(0, 4), +month.slice(5)), mEnd = month + "-" + String(dim).padStart(2, "0");
    const fyi = P.fyInfo(mStart);

    let { data: run } = await db.from("payroll_runs").select("*").eq("month", mStart).maybeSingle();
    if (run && run.status !== "draft") return res(409, { error: `Payroll for this month is already ${run.status}.` });
    if (!run) {
      const ins = await db.from("payroll_runs").insert({ month: mStart }).select().single();
      if (ins.error) return res(400, { error: ins.error.message });
      run = ins.data;
    }

    const q = await Promise.all([
      db.from("employees").select("id,emp_code,full_name,joining_date,exit_date,status").lte("joining_date", mEnd),
      db.from("employee_private").select("employee_id,pan,bank_account,ifsc"),
      db.from("salary_structures").select("*").lte("effective_from", mEnd).order("effective_from", { ascending: false }),
      db.from("attendance_months").select("employee_id,lop_days").eq("month", mStart),
      db.from("one_time_items").select("employee_id,amount").eq("month", mStart),
      db.from("statutory_rules").select("rule,effective_from").lte("effective_from", mEnd).order("effective_from", { ascending: false }).limit(1),
      db.from("tax_declarations").select("*").eq("fy", fyi.fy),
      db.from("opening_balances").select("*").eq("fy", fyi.fy),
      db.from("payroll_runs").select("id,month,status").gte("month", fyi.start).lt("month", mStart).in("status", ["locked", "released"]),
    ]);
    const bad = q.find((x) => x.error); if (bad) return res(500, { error: bad.error.message });
    const [emps, priv, sals, att, oti, rl, decls, opens, runs] = q.map((x) => x.data || []);
    if (!rl.length) return res(400, { error: "No statutory rules found. Ask your CA to confirm them and add them first." });
    const rules = rl[0].rule;

    let prior = [];
    if (runs.length) {
      const pr = await db.from("payroll_items").select("employee_id,gross,lop_amount,bonus,pf,pt,tds").in("run_id", runs.map((r) => r.id));
      if (pr.error) return res(500, { error: pr.error.message }); prior = pr.data || [];
    }

    const rows = [], excluded = [];
    for (const e of emps) {
      const active = e.status === "active" ? !(e.exit_date && e.exit_date < mStart) : !!(e.exit_date && e.exit_date >= mStart);
      if (!active) continue;
      const mine = sals.filter((s) => s.employee_id === e.id);
      const sal = mine.find((s) => s.effective_from <= mStart) || mine[mine.length - 1];
      if (!sal) { excluded.push({ id: e.id, name: e.full_name, reason: "No salary structure" }); continue; }
      const p = priv.find((x) => x.employee_id === e.id) || {}, op = opens.find((x) => x.employee_id === e.id) || {};
      const hist = prior.filter((x) => x.employee_id === e.id);
      const out = P.computeEmployee({
        emp: e, sal, month: mStart, rules,
        lop: (att.find((a) => a.employee_id === e.id) || {}).lop_days || 0,
        oneTime: oti.filter((o) => o.employee_id === e.id).reduce((s, o) => s + +o.amount, 0),
        decl: decls.find((d) => d.employee_id === e.id) || null,
        prior: { monthsKnown: (op.months_paid || 0) + hist.length,
                 grossYtd: (+op.gross_ytd || 0) + hist.reduce((s, x) => s + (+x.gross - +x.lop_amount + +x.bonus), 0),
                 tdsYtd: (+op.tds_ytd || 0) + hist.reduce((s, x) => s + +x.tds, 0),
                 pfYtd: (+op.pf_ytd || 0) + hist.reduce((s, x) => s + +x.pf, 0),
                 ptYtd: (+op.pt_ytd || 0) + hist.reduce((s, x) => s + +x.pt, 0) },
      });
      if (mine.some((s) => s.effective_from > mStart)) out.warnings.push("Salary was revised during this month. Add the difference as arrears under one-time items.");
      if (!p.bank_account || !p.ifsc) out.warnings.push("Bank details missing.");
      if (!p.pan) out.warnings.push("PAN missing (needed for the payslip password).");
      const { warnings, ...cols } = out;
      rows.push({ run_id: run.id, employee_id: e.id, ...cols, notes: warnings });
    }

    const del = await db.from("payroll_items").delete().eq("run_id", run.id);
    if (del.error) return res(400, { error: del.error.message });
    if (rows.length) { const ins = await db.from("payroll_items").insert(rows); if (ins.error) return res(400, { error: ins.error.message }); }
    return res(200, { run_id: run.id, status: "draft", included: rows.length, excluded });
  } catch (e) {
    return res(500, { error: "Server error while calculating payroll." });
  }
};
