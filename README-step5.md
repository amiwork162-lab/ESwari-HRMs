# ESwari HRMS: Step 5 (leave balances and holiday calendar)

## 1. Update the database (once)
Supabase > SQL Editor > run `supabase/step5.sql` (in the eswari-backend folder), after step4.sql. Then redeploy the updated site. No new Netlify settings are needed.

## 2. Set it up (HR Admin > Leave setup)
1. **Leave year and weekly offs**: choose the month your leave year starts (January or April, for example) and which days are the weekly off (Sunday, or Saturday and Sunday).
2. **Yearly quotas**: the starting values (casual 12, sick 6, earned 15 with up to 15 carried forward, unpaid unlimited) are **samples**. Change them to your leave policy, and add leave types such as maternity.
3. **Holiday calendar**: add each company holiday. Mark a holiday as Optional if it is not a day off for everyone. Optional holidays are not skipped when counting leave days.
4. **Opening balances**: if people have already taken leave this year, add or remove days under "Balances today" so each balance matches your records.

## What employees and managers see
- **My leave**: balance cards (available, used, pending), a live "working days" count while picking dates, upcoming holidays, and Cancel on pending requests.
- Leave days count **working days only**. Weekly offs and company holidays are skipped.
- **Leave approvals**: shows the working days for each request.

## Rules enforced by the database
- A request cannot exceed the available balance (pending requests are held back too). Unpaid leave has no limit.
- Overlapping requests are refused.
- A range with no working days is refused.
- Once decided, a request cannot be edited. Employees can cancel only their own pending requests.
- A manager can no longer change the dates or days of a request while approving it.
- Every change is recorded in the audit log.

## How balances are worked out
Yearly quota (prorated by joining month, to the nearest half day) + carry forward from last year (capped, one year back) + adjustments - approved days - pending days.

## Payroll link
In **Attendance**, "Fill from approved unpaid leave" fills loss-of-pay days from approved unpaid leave for the month. Review, then Save.

## Not included yet
- Half-day leave.
- A leave spanning two leave years counts fully in the year it starts.
- Cancelling or reversing an already approved request.
- Bulk Excel import of holidays.
