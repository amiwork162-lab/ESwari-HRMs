"use strict";
// ESwari payroll engine. Pure functions: no database, easy to test. All rules come from the statutory_rules table.
const r0 = (n) => Math.round(n);
const r2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, "0");
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// Financial year position of a month ("YYYY-MM-01"). idx 0 = April.
function fyInfo(month) {
  const y = +month.slice(0, 4), m = +month.slice(5, 7), sy = m >= 4 ? y : y - 1;
  return { fy: sy + "-" + pad((sy + 1) % 100), start: sy + "-04-01", idx: (m - 4 + 12) % 12 };
}
function slabTax(slabs, income) {
  let tax = 0, prev = 0;
  for (const [upto, rate] of slabs) {
    const top = upto == null ? Infinity : upto;
    if (income > prev) tax += (Math.min(income, top) - prev) * rate;
    if (income <= top) break;
    prev = top;
  }
  return tax;
}
function annualTax(rules, regime, taxable) {
  const t = rules.tax, r = t[regime];
  let tax = slabTax(r.slabs, taxable);
  if (taxable <= r.rebate_limit) tax = Math.max(0, tax - r.rebate_max);
  else if (r.marginal_relief) tax = Math.min(tax, taxable - r.rebate_limit);
  return Math.round(tax * (1 + t.cess));
}
function ptHalfYearly(slabs, halfIncome) {
  for (const [upto, amt] of slabs) if (upto == null || halfIncome <= upto) return amt;
  return 0;
}

// inp: { emp:{joining_date,exit_date}, sal, lop, oneTime, month:"YYYY-MM-01", rules, decl, prior:{monthsKnown,grossYtd,tdsYtd,pfYtd,ptYtd} }
function computeEmployee(inp) {
  const { emp, sal, rules, month } = inp, prior = inp.prior || {}, warnings = [];
  const y = +month.slice(0, 4), m = +month.slice(5, 7), dim = daysInMonth(y, m), monthEnd = `${month.slice(0, 8)}${pad(dim)}`;
  const start = emp.joining_date > month ? emp.joining_date : month;
  const end = emp.exit_date && emp.exit_date < monthEnd ? emp.exit_date : monthEnd;
  const employed = end >= start ? dayDiff(start, end) + 1 : 0;
  const lop = Math.min(Math.max(+inp.lop || 0, 0), employed), paid = employed - lop, factor = paid / dim;
  if (employed < dim) warnings.push(`Employed for ${employed} of ${dim} days this month (pay is prorated).`);
  const basic = +sal.basic, hra = +sal.hra || 0, al = +sal.allowances || 0, gross = basic + hra + al;
  const lopAmount = r2(gross * (1 - factor)), earnedRec = gross - lopAmount, one = r2(+inp.oneTime || 0);
  const earnedTotal = r2(earnedRec + one);

  const wages = rules.wage_base === "labour_code" ? Math.max(basic * factor, 0.5 * earnedRec) : basic * factor;
  const pf = sal.pf_applicable ? r0(Math.min(wages, rules.pf.wage_ceiling) * rules.pf.employee_rate) : 0;
  const esi = sal.esi_applicable && gross <= rules.esi.gross_limit ? Math.ceil(earnedTotal * rules.esi.employee_rate - 1e-9) : 0;
  const pt = sal.pt_applicable && paid > 0 ? r0(ptHalfYearly(rules.pt.half_yearly_slabs, gross * 6) / 6) : 0;

  // TDS: project the full year, work out annual tax, then spread what is still unpaid over the months left.
  let tds = 0;
  const fyi = fyInfo(month), remaining = 12 - fyi.idx;
  if (paid > 0) {
    // Months before the employee joined this financial year are not projected (they earned nothing here).
    const joinIdx = emp.joining_date > fyi.start ? fyInfo(emp.joining_date.slice(0, 8) + "01").idx : 0;
    const known = Math.min(prior.monthsKnown || 0, fyi.idx - joinIdx), missing = Math.max(0, fyi.idx - joinIdx - known);
    if (joinIdx > 0 || (emp.joining_date > fyi.start && joinIdx === 0)) warnings.push("Joined during this financial year: income from a previous employer is not included. Collect Form 12B if it applies.");
    if (missing > 0) warnings.push(`No payroll history for ${missing} earlier month(s) this year, so tax is estimated. Add opening balances for accuracy.`);
    const projected = (prior.grossYtd || 0) + missing * gross + earnedTotal + (remaining - 1) * gross;
    if (!inp.decl) warnings.push("No tax declaration found; new regime assumed.");
    const regime = inp.decl && inp.decl.regime === "old" ? "old" : "new", rg = rules.tax[regime];
    let taxable;
    if (regime === "new") taxable = Math.max(0, projected - rg.std_deduction);
    else {
      const d = (inp.decl && inp.decl.declared) || {};
      const pfAnnual = (prior.pfYtd || 0) + pf + (remaining - 1) * pf;
      const ptAnnual = Math.min(2500, (prior.ptYtd || 0) + pt + (remaining - 1) * pt);
      const c80 = Math.min((+d.sec80c || 0) + pfAnnual, rg.cap_80c), c80d = Math.min(+d.sec80d || 0, rg.cap_80d);
      const loan = Math.min(+d.home_loan_interest || 0, rg.cap_home_loan_interest);
      const rent = (+d.monthly_rent || 0) * 12;
      const hraEx = Math.max(0, Math.min(hra * 12, rent - 0.1 * basic * 12, rg.hra_metro_pct * basic * 12));
      taxable = Math.max(0, projected - rg.std_deduction - c80 - c80d - loan - hraEx - ptAnnual);
    }
    if (taxable > 5000000) warnings.push("High income: surcharge is not included in TDS. Check with your CA.");
    tds = Math.max(0, r0((annualTax(rules, regime, taxable) - (prior.tdsYtd || 0)) / remaining));
  } else if (employed === 0) warnings.push("Not employed during this month.");

  const net = r2(earnedTotal - pf - esi - pt - tds);
  if (net < 0) warnings.push("Net pay is negative. Check deductions and one-time items.");
  return { gross: r2(gross), lop_amount: lopAmount, bonus: one, pf, esi, pt, tds, net, paid_days: paid, days_in_month: dim,
           basic: r2(basic), hra: r2(hra), allowances: r2(al), warnings };
}
module.exports = { computeEmployee, annualTax, slabTax, fyInfo, daysInMonth, ptHalfYearly };
