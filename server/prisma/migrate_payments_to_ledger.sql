-- server/prisma/migrate_payments_to_ledger.sql
--
-- Run ONCE, after `npx prisma migrate dev` adds IPD_Payment.methodOther and
-- Invoice.payments.
--
-- The admission form used to hold four flat amounts per patient — deposit,
-- cash, upi, card — with no dates. It now keeps a dated list of payments in
-- the IPD_Payment ledger instead, which is what lets the invoice print
-- deposits by date.
--
-- This turns each existing non-zero column into one ledger row, dated to the
-- patient's admission date (the best guess available — the old columns never
-- recorded when the money arrived). Correct individual dates afterwards from
-- the admission form if you need them exact.
-- 1. What will be created? Check this before running anything.
SELECT "serialNumber",
    name,
    "admissionDate",
    deposit,
    cash,
    upi,
    card,
    "totalPaid",
    (
        SELECT COUNT(*)
        FROM ipd_payments
        WHERE "patientId" = p.id
    ) AS existing_ledger_rows
FROM ipd_patients p
WHERE deposit > 0
    OR cash > 0
    OR upi > 0
    OR card > 0
ORDER BY "admissionDate";
-- 2. Create one ledger row per non-zero column.
--
--    Patients who ALREADY have ledger rows are skipped: under the old code
--    the two sources overwrote each other, so their columns are a stale
--    copy of something and re-importing them would double-count.
INSERT INTO ipd_payments (
        id,
        amount,
        method,
        "paymentDate",
        "patientId",
        "createdAt",
        "updatedAt",
        notes
    )
SELECT gen_random_uuid()::text,
    v.amount,
    v.method::"PaymentMethod",
    p."admissionDate",
    p.id,
    NOW(),
    NOW(),
    'Imported from the old admission-form payment fields — date defaulted to the admission date'
FROM ipd_patients p
    CROSS JOIN LATERAL (
        VALUES (p.cash, 'CASH'),
            (p.upi, 'UPI'),
            (p.card, 'CARD'),
            -- deposit minus the three named modes is whatever was collected some
            -- other way; recorded as OTHER rather than silently dropped.
            (
                GREATEST(0, p.deposit - p.cash - p.upi - p.card),
                'OTHER'
            )
    ) AS v(amount, method)
WHERE v.amount > 0
    AND NOT EXISTS (
        SELECT 1
        FROM ipd_payments
        WHERE "patientId" = p.id
    );
-- 3. Rebuild every patient's totals from the ledger. deposit is now the
--    whole, and cash/upi/card break that same whole down by mode — they are
--    no longer added together.
UPDATE ipd_patients p
SET "totalPaid" = t.total,
    deposit = t.total,
    cash = t.cash,
    upi = t.upi,
    card = t.card
FROM (
        SELECT pt.id,
            ROUND(COALESCE(SUM(pay.amount), 0)::numeric, 2) AS total,
            ROUND(
                COALESCE(
                    SUM(pay.amount) FILTER (
                        WHERE pay.method = 'CASH'
                    ),
                    0
                )::numeric,
                2
            ) AS cash,
            ROUND(
                COALESCE(
                    SUM(pay.amount) FILTER (
                        WHERE pay.method = 'UPI'
                    ),
                    0
                )::numeric,
                2
            ) AS upi,
            ROUND(
                COALESCE(
                    SUM(pay.amount) FILTER (
                        WHERE pay.method = 'CARD'
                    ),
                    0
                )::numeric,
                2
            ) AS card
        FROM ipd_patients pt
            LEFT JOIN ipd_payments pay ON pay."patientId" = pt.id
        GROUP BY pt.id
    ) t
WHERE p.id = t.id;
-- 4. Re-cap refunds against the corrected totalPaid, then recompute balance
--    and settlement. (Same as steps 7 in fix_over_refunds.sql — safe to
--    re-run.)
UPDATE ipd_patients
SET "refundAmount" = LEAST(
        "refundAmount",
        GREATEST(0, "totalPaid" - "totalStay")
    );
UPDATE ipd_patients
SET balance = ROUND(
        ("totalStay" - ("totalPaid" - "refundAmount"))::numeric,
        2
    ),
    "settlementStatus" = CASE
        WHEN ("totalPaid" - "refundAmount") <= 0 THEN 'Pending'
        WHEN ("totalPaid" - "refundAmount") > "totalStay" THEN 'Overpaid'
        WHEN ("totalPaid" - "refundAmount") = "totalStay" THEN 'Fully Paid'
        ELSE 'Partially Paid'
    END;
-- 5. Verify: totalPaid should equal the ledger sum for every patient.
--    This should return no rows.
SELECT p."serialNumber",
    p.name,
    p."totalPaid",
    COALESCE(SUM(pay.amount), 0) AS ledger_total
FROM ipd_patients p
    LEFT JOIN ipd_payments pay ON pay."patientId" = p.id
GROUP BY p.id,
    p."serialNumber",
    p.name,
    p."totalPaid"
HAVING ROUND(p."totalPaid"::numeric, 2) <> ROUND(COALESCE(SUM(pay.amount), 0)::numeric, 2);