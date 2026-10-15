"use strict";
const { jsPDF } = require("jspdf");
const MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const money = (n) => "Rs " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (m) => MON[+m.slice(5, 7) - 1] + " " + m.slice(0, 4);

// Builds a password-protected payslip PDF. The password is the employee's PAN (capitals).
function buildPayslip({ company, month, emp, item, password }) {
  const doc = new jsPDF({ encryption: { userPassword: password, ownerPassword: (process.env.PDF_OWNER_PASSWORD || "owner") + "-" + emp.emp_code, userPermissions: ["print"] } });
  let y = 22;
  const line = (a, b, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(String(a), 20, y); if (b != null) doc.text(String(b), 190, y, { align: "right" }); y += 7.5; };
  doc.setFontSize(15); line(company); doc.setFontSize(11); line("Payslip for " + monthName(month), null, true); y += 2;
  line("Employee", emp.full_name + " (" + emp.emp_code + ")"); if (emp.designation) line("Designation", emp.designation);
  line("Days paid", item.paid_days + " of " + item.days_in_month); y += 3;
  line("Earnings", null, true); line("Basic", money(item.basic)); line("HRA", money(item.hra)); line("Allowances", money(item.allowances));
  if (+item.lop_amount) line("Loss of pay / proration", "-" + money(item.lop_amount));
  if (+item.bonus) line("Bonus, arrears and adjustments", money(item.bonus));
  const earned = +item.gross - +item.lop_amount + +item.bonus;
  line("Total earnings", money(earned), true); y += 3;
  line("Deductions", null, true); line("Provident fund", money(item.pf)); if (+item.esi) line("ESI", money(item.esi));
  line("Professional tax", money(item.pt)); line("Income tax (TDS)", money(item.tds));
  const ded = +item.pf + +item.esi + +item.pt + +item.tds;
  line("Total deductions", money(ded), true); y += 3;
  doc.setFontSize(13); line("Net pay", money(item.net), true);
  doc.setFontSize(9); y += 4; doc.text("This is a system-generated payslip.", 20, y);
  return Buffer.from(doc.output("arraybuffer"));
}
module.exports = { buildPayslip, monthName };
