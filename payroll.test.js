// Run with: node tests/payroll.test.js
const assert = require("assert");
const P = require("../netlify/functions/lib/payroll");
const rules = {
  wage_base: "labour_code", pf: { wage_ceiling: 15000, employee_rate: 0.12 }, esi: { gross_limit: 21000, employee_rate: 0.0075 },
  pt: { half_yearly_slabs: [[21000,0],[30000,135],[45000,315],[60000,690],[75000,1025],[null,1250]] },
  tax: { cess: 0.04,
    new: { std_deduction: 75000, rebate_limit: 1200000, rebate_max: 60000, marginal_relief: true, slabs: [[400000,0],[800000,.05],[1200000,.10],[1600000,.15],[2000000,.20],[2400000,.25],[null,.30]] },
    old: { std_deduction: 50000, rebate_limit: 500000, rebate_max: 12500, marginal_relief: false, slabs: [[250000,0],[500000,.05],[1000000,.20],[null,.30]], cap_80c: 150000, cap_80d: 100000, cap_home_loan_interest: 200000, hra_metro_pct: 0.5 } } };
const flags = { pf_applicable: true, esi_applicable: true, pt_applicable: true };
const emp = { joining_date: "2024-01-01", exit_date: null };
const run = (o) => P.computeEmployee({ emp, rules, month: "2026-09-01", lop: 0, oneTime: 0, decl: { regime: "new" }, prior: { monthsKnown: 5 }, ...o });
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };

t("annual tax new regime: tax-free up to 12L taxable", () => assert.strictEqual(P.annualTax(rules, "new", 1200000), 0));
t("annual tax new regime: 13.65L taxable = 88,140 with cess", () => assert.strictEqual(P.annualTax(rules, "new", 1365000), 88140));
t("marginal relief just above 12L (12.2L -> 20,800)", () => assert.strictEqual(P.annualTax(rules, "new", 1220000), 20800));
t("annual tax old regime: 7,92,504 taxable = 73,841", () => assert.strictEqual(P.annualTax(rules, "old", 792504), 73841));
t("old regime rebate: 5L taxable is nil", () => assert.strictEqual(P.annualTax(rules, "old", 500000), 0));
t("TN professional tax is on half-yearly income (25k/month -> 208)", () => assert.strictEqual(P.computeEmployee({ emp, sal: { basic: 15000, hra: 6000, allowances: 4000, ...flags }, rules, month: "2026-09-01", decl: { regime: "new" }, prior: { monthsKnown: 5 } }).pt, 208));
t("PT is 0 when gross is up to 3,500 a month", () => assert.strictEqual(P.computeEmployee({ emp, sal: { basic: 3000, hra: 0, allowances: 0, ...flags }, rules, month: "2026-09-01", prior: { monthsKnown: 5 } }).pt, 0));

t("PF capped at 15,000 wage (1,800)", () => assert.strictEqual(run({ sal: { basic: 50000, hra: 30000, allowances: 20000, ...flags } }).pf, 1800));
t("PF on low basic uses the 50% wage rule (basic 12k, gross 40k -> wages 20k, capped 15k)", () => assert.strictEqual(run({ sal: { basic: 12000, hra: 20000, allowances: 8000, ...flags } }).pf, 1800));
t("PF off when not applicable", () => assert.strictEqual(run({ sal: { basic: 50000, hra: 30000, allowances: 20000, ...flags, pf_applicable: false } }).pf, 0));
t("ESI 0.75% rounded up (gross 19,000 -> 143)", () => assert.strictEqual(run({ sal: { basic: 12000, hra: 4800, allowances: 2200, ...flags } }).esi, 143));
t("ESI none above the 21,000 limit", () => assert.strictEqual(run({ sal: { basic: 15000, hra: 6000, allowances: 3000, ...flags } }).esi, 0));

t("LOP: 2 days of 30 reduces gross by 1/15", () => {
  const r = run({ sal: { basic: 30000, hra: 0, allowances: 0, ...flags }, lop: 2 });
  assert.strictEqual(r.lop_amount, 2000); assert.strictEqual(r.paid_days, 28);
});
t("new joiner on 16 Sep is paid 15 of 30 days", () => {
  const r = run({ emp: { joining_date: "2026-09-16" }, sal: { basic: 30000, hra: 0, allowances: 0, ...flags } });
  assert.strictEqual(r.paid_days, 15); assert.strictEqual(r.lop_amount, 15000); assert.ok(r.warnings.some((w) => /prorated/.test(w)));
});
t("leaver on 10 Sep is paid 10 days", () => assert.strictEqual(run({ emp: { joining_date: "2024-01-01", exit_date: "2026-09-10" }, sal: { basic: 30000, hra: 0, allowances: 0, ...flags } }).paid_days, 10));
t("not employed this month gives zeros and a warning", () => {
  const r = run({ emp: { joining_date: "2026-11-01" }, sal: { basic: 30000, hra: 0, allowances: 0, ...flags } });
  assert.strictEqual(r.net, 0); assert.ok(r.warnings.some((w) => /Not employed/.test(w)));
});
t("one-time bonus adds to net and can be negative", () => {
  const a = run({ sal: { basic: 30000, hra: 0, allowances: 0, ...flags }, oneTime: 5000 }), b = run({ sal: { basic: 30000, hra: 0, allowances: 0, ...flags }, oneTime: -1000 });
  assert.strictEqual(a.bonus, 5000); assert.ok(a.net > b.net);
});

t("TDS new regime, 75k a month, no history: tax-free (nil)", () => assert.strictEqual(run({ sal: { basic: 45000, hra: 18000, allowances: 12000, ...flags } }).tds, 0));
t("TDS new regime, 1.2L a month, Sep, no prior TDS: 88,140 spread over 7 months (12,591)", () => {
  const r = run({ sal: { basic: 60000, hra: 36000, allowances: 24000, ...flags }, prior: { monthsKnown: 0 } });
  assert.strictEqual(r.tds, 12591); assert.ok(r.warnings.some((w) => /No payroll history for 5/.test(w)));
});
t("TDS credits tax already deducted (opening balance)", () => {
  const r = run({ sal: { basic: 60000, hra: 36000, allowances: 24000, ...flags }, prior: { monthsKnown: 5, grossYtd: 600000, tdsYtd: 40000 } });
  assert.strictEqual(r.tds, Math.round((88140 - 40000) / 7)); assert.strictEqual(r.warnings.filter((w) => /history/.test(w)).length, 0);
});
t("TDS old regime from April: 73,841 / 12 = 6,153", () => {
  const r = P.computeEmployee({ emp, sal: { basic: 50000, hra: 30000, allowances: 20000, ...flags }, rules, month: "2026-04-01", lop: 0, oneTime: 0,
    decl: { regime: "old", declared: { sec80c: 150000, sec80d: 25000, monthly_rent: 20000 } }, prior: { monthsKnown: 0 } });
  assert.strictEqual(r.tds, 6153);
});
t("missing declaration assumes new regime and says so", () => assert.ok(run({ sal: { basic: 30000, hra: 0, allowances: 0, ...flags }, decl: null }).warnings.some((w) => /new regime assumed/.test(w))));
t("net = earned - deductions", () => {
  const r = run({ sal: { basic: 60000, hra: 36000, allowances: 24000, ...flags }, prior: { monthsKnown: 0 } });
  assert.strictEqual(r.net, r.gross - r.lop_amount + r.bonus - r.pf - r.esi - r.pt - r.tds);
});
t("mid-year joiner: months before joining are not projected, and a previous-employer warning is shown", () => {
  const r = run({ emp: { joining_date: "2026-09-16" }, sal: { basic: 60000, hra: 36000, allowances: 24000, ...flags }, prior: { monthsKnown: 0 } });
  assert.ok(!r.warnings.some((w) => /No payroll history/.test(w)));
  assert.ok(r.warnings.some((w) => /previous employer/.test(w)));
  // 15 of 30 days this month at half pay, then 6 full months: projected = 60,000 + 6 x 120,000 = 780,000, taxable 705,000 -> 5% on 305,000 = 15,250 tax, nil after rebate
  assert.strictEqual(r.tds, 0);
});
t("someone employed all year gets no previous-employer warning", () => assert.ok(!run({ sal: { basic: 30000, hra: 0, allowances: 0, ...flags } }).warnings.some((w) => /previous employer/.test(w))));
t("financial year helper", () => { assert.deepStrictEqual(P.fyInfo("2026-09-01"), { fy: "2026-27", start: "2026-04-01", idx: 5 }); assert.strictEqual(P.fyInfo("2027-02-01").fy, "2026-27"); assert.strictEqual(P.fyInfo("2027-03-01").idx, 11); });
console.log(`\n${n} tests passed`);
