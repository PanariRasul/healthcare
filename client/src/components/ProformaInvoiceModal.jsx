// client/src/components/ProformaInvoiceModal.jsx
//
// Read-only bill preview for OPD and IPD, opened from the patient details
// page. Nothing here saves, edits, or finalizes anything — it exists so
// staff and patients can see and print what the bill currently comes to.
//
// Usage:
//   <ProformaInvoiceModal type="IPD" patient={p} onClose={...} />
//   <ProformaInvoiceModal type="OPD" patient={p} onClose={...} />
//
// What it shows:
//   - If the patient already has an invoice, the exact figures on it. A
//     finalized one prints as the real invoice; a draft prints as a
//     proforma, because it can still change.
//   - If they have no invoice yet, the charges recorded so far, priced the
//     same way the Generate Invoice screen would price them.
//
// REFUND
//   Read live from the patient record for a draft, so a refund entered in
//   Patient Details or the edit form shows up here immediately. A finalized
//   invoice keeps the figures it was issued with. The refund line is
//   omitted entirely when there is no refund.
//
// PRINTING
//   Fixed 12px type and tight print spacing so a normal bill lands on one
//   A4 page. The meta and patient blocks are forced to a 4-column grid on
//   print — Tailwind's `sm:` breakpoint isn't reliable in a print
//   stylesheet, which is what made those fields wrap into ragged rows.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Loader2, FileText, Lock } from "lucide-react";
import { api } from "../lib/api";
import { fetchPatient as fetchIpdPatient } from "../pages/ipd/api/ipd.api";
import { fetchPatientInvoice } from "../api/invoice.api";
import { fmtDate, fmtDateTime, fmtINR } from "../lib/dateFormat";
import {
    buildLineItems,
    calcTotals,
    buildPaymentRows,
    sumPayments,
} from "../lib/invoiceLines";

const CLINIC = {
    name: "Virupakshipuram Paralysis Centre",
    tagline: "Physiotherapy & Neuro Rehabilitation",
    logoUrl: "/healthcare.jpg",
    gstin: "29ABCDE1234F1Z5",
    footerName: "Virupakshipuram Paralysis Centre",
    footerAddress:
        "No.6, G R Plaza, 24th Main Rd, opp. Empire Restaurant, 5th Phase, Ayodya Nagar, J P Nagar Phase 5, J. P. Nagar, Bengaluru, Karnataka 560078",
};

// One label/value cell. Fixed shape means every field in a row lines up on
// the same two baselines, on screen and on paper.
function Field({ label, value }) {
    return (
        <div className="min-w-0">
            <div className="text-slate-400 text-[10px] print:text-[10px] uppercase font-bold tracking-wide leading-tight">
                {label}
            </div>
            <div className="font-extrabold leading-tight truncate">
                {value === null || value === undefined || value === "" ? "—" : value}
            </div>
        </div>
    );
}

export default function ProformaInvoiceModal({ type, patient, onClose }) {
    const isIPD = type === "IPD";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [full, setFull] = useState(null);
    const [invoice, setInvoice] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError("");
            try {
                const data = isIPD
                    ? await fetchIpdPatient(patient.id)
                    : (await api.get(`/opd/patients/${patient.id}`)).patient;
                if (cancelled) return;
                setFull(data);

                const inv = await fetchPatientInvoice(type, patient.id).catch(
                    () => null,
                );
                if (!cancelled) setInvoice(inv);
            } catch (err) {
                if (!cancelled)
                    setError(err.message || "Could not load this patient's bill.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patient?.id, type]);

    const isFinalized = invoice?.status === "FINALIZED";

    // Saved invoice wins; otherwise price the charges recorded so far.
    const lineItems = invoice
        ? (Array.isArray(invoice.lineItems) ? invoice.lineItems : []).map(
            (it, i) => ({ id: `saved-${i}`, ...it }),
        )
        : buildLineItems(full, type);

    // For a draft, the patient record is the live source of truth for the
    // refund — it can be changed after the invoice was saved. A finalized
    // invoice keeps its own figures.
    const liveRefund = isIPD && !isFinalized ? Number(full?.refundAmount) || 0 : null;

    // Dated list of what the patient handed over. A finalized invoice keeps
    // its own snapshot; a draft re-reads the patient's ledger, since payments
    // can be added after the invoice was last saved.
    const paymentRows = buildPaymentRows(
        isFinalized ? invoice?.payments || [] : full?.payments || invoice?.payments || [],
    );
    const hasPaymentRows = paymentRows.length > 0;

    const totals = invoice
        ? (() => {
            const refundVal =
                liveRefund !== null ? liveRefund : invoice.refundAmount || 0;
            const paidVal = hasPaymentRows
                ? sumPayments(
                    isFinalized ? invoice.payments : full?.payments || invoice.payments,
                )
                : invoice.paid || 0;
            const grandTotal = invoice.grandTotal || 0;
            return {
                subtotal: invoice.subtotal || 0,
                discountVal: invoice.discount || 0,
                gstAmount: invoice.gstAmount || 0,
                grandTotal,
                paidVal,
                refundVal,
                netPaid: Math.round((paidVal - refundVal) * 100) / 100,
                balance: Math.round((grandTotal - (paidVal - refundVal)) * 100) / 100,
            };
        })()
        : calcTotals({
            lineItems,
            paid: hasPaymentRows
                ? sumPayments(full?.payments)
                : isIPD
                    ? full?.totalPaid
                    : full?.total,
            refundAmount: isIPD ? full?.refundAmount : 0,
        });

    const gstPercent = invoice?.gstPercent || 0;
    const paymentMethod = invoice?.paymentMethod || "";
    const notes = invoice?.notes || "";

    // Refund descriptors follow the same rule: live from the patient on a
    // draft, frozen from the invoice once finalized.
    const refundReason = isFinalized
        ? invoice?.refundReason || ""
        : full?.refundReason || invoice?.refundReason || "";
    const refundDate = isFinalized
        ? invoice?.refundDate || null
        : full?.refundDate || invoice?.refundDate || null;
    const refundMethod = isFinalized
        ? invoice?.refundMethod || ""
        : full?.refundMethod || invoice?.refundMethod || "";

    const showRefund = (totals.refundVal || 0) > 0;
    const docLabel = isFinalized ? "Invoice" : "Proforma Invoice";

    // The bottom line: what is still owed after everything above.
    //   positive -> the patient still owes the clinic
    //   negative -> the clinic is still holding money that isn't theirs
    //   zero     -> nothing moves either way
    // At zero the amount is written out in words rather than as "₹0", which
    // read like a contradiction next to a "Fully Settled" label.
    const balanceLabel =
        totals.balance < 0 ? "Advance Still Held" : "Balance Due";
    const balanceValue =
        totals.balance === 0 ? "Nothing due" : fmtINR(Math.abs(totals.balance));

    // One sentence spelling out the arithmetic, so the reader doesn't have to
    // work out how five rows of figures relate to each other.
    const settlementSentence = (() => {
        const bill = fmtINR(totals.grandTotal);
        const paidTxt = fmtINR(totals.paidVal);
        const paidWhat = hasPaymentRows
            ? `${paymentRows.length} payment${paymentRows.length === 1 ? "" : "s"} totalling ${paidTxt}`
            : paidTxt;
        const bal = totals.balance;
        if (!showRefund) {
            if (bal > 0)
                return `Bill ${bill}. Patient has paid ${paidWhat}, so ${fmtINR(bal)} is still to collect.`;
            if (bal < 0)
                return `Bill ${bill}. Patient has paid ${paidWhat} — ${fmtINR(Math.abs(bal))} more than the bill.`;
            return `Bill ${bill}, paid in full (${paidWhat}). Neither side owes the other anything.`;
        }
        const refundTxt = fmtINR(totals.refundVal);
        const keptTxt = fmtINR(totals.netPaid);
        if (bal > 0)
            return `Bill ${bill}. Patient paid ${paidWhat} and ${refundTxt} was returned, so the clinic has kept ${keptTxt} — ${fmtINR(bal)} is still to collect.`;
        if (bal < 0)
            return `Bill ${bill}. Patient paid ${paidWhat} and ${refundTxt} was returned, leaving ${keptTxt} held — ${fmtINR(Math.abs(bal))} more than the bill.`;
        return `Bill ${bill}. Patient paid ${paidWhat}, the extra ${refundTxt} was returned, and the ${keptTxt} kept covers the bill exactly. Neither side owes the other anything.`;
    })();

    return createPortal(
        <div className="proforma-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <style>{`
        @media print {
          @page { margin: 10mm; size: A4 portrait; }

          /* Hide everything except this modal. display:none rather than
             visibility:hidden — hidden elements still occupy layout and
             were producing a near-blank extra page. */
          body > *:not(.proforma-modal-backdrop) { display: none !important; }

          /* The backdrop is fixed + flex-centered on screen, which confuses
             print pagination. Flatten it to a static block. */
          .proforma-modal-backdrop {
            position: static !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            display: block !important;
          }

          .proforma-print-area {
            position: static !important;
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .no-print, .print-hide { display: none !important; }

          /* 12px throughout, tight leading — the main lever for keeping a
             normal bill on a single page. */
          .proforma-print-area, .proforma-print-area * {
            font-size: 12px !important;
            line-height: 1.3 !important;
            color: #000 !important;
          }
          .proforma-print-area .invoice-clinic-name { font-size: 15px !important; }
          .proforma-print-area .invoice-clinic-tagline { font-size: 11px !important; }

          .proforma-print-area table { border-collapse: collapse !important; }
          .proforma-print-area table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

            <div
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl proforma-print-area"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10 no-print">
                    <div>
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                            {docLabel}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                            {isFinalized
                                ? "The final, locked bill for this patient"
                                : "A preview of the bill so far — nothing here is saved"}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-xs font-bold text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29] mr-2" />
                        Preparing the bill...
                    </div>
                ) : error ? (
                    <div className="p-6">
                        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                            {error}
                        </div>
                    </div>
                ) : (
                    <div className="p-6 sm:p-8 print:p-0 space-y-5 print:space-y-2.5 text-slate-900 dark:text-white">
                        {/* Letterhead */}
                        <div className="text-center pb-3 print:pb-2 border-b-2 border-[#0f4a29] dark:border-[#52b788]">
                            {CLINIC.logoUrl && (
                                <img
                                    src={CLINIC.logoUrl}
                                    alt="Clinic logo"
                                    className="h-12 print:h-9 mx-auto mb-1.5 print:mb-1 object-contain"
                                />
                            )}
                            <h1 className="invoice-clinic-name font-extrabold tracking-wide text-base">
                                {CLINIC.name}
                            </h1>
                            <p className="invoice-clinic-tagline text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                                {CLINIC.tagline}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                                GSTIN: {CLINIC.gstin}
                            </p>
                            <p className="mt-1.5 print:mt-1 inline-block text-[10px] font-extrabold tracking-[0.25em] uppercase border border-slate-800 dark:border-slate-300 rounded-full px-3 py-0.5">
                                {docLabel}
                            </p>
                        </div>

                        {/* Status banner — screen only */}
                        {isFinalized ? (
                            <div className="no-print bg-slate-900 dark:bg-slate-800 rounded-2xl px-4 py-3 text-white text-xs font-bold flex items-start gap-2.5">
                                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                                <div>
                                    Finalized on {fmtDateTime(invoice.finalizedAt)}
                                    {invoice.finalizedByName
                                        ? ` by ${invoice.finalizedByName}`
                                        : ""}
                                    . These figures are locked.
                                </div>
                            </div>
                        ) : (
                            <div className="no-print bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl px-4 py-3 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-start gap-2.5">
                                <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                    <div>
                                        {invoice
                                            ? `Draft invoice ${invoice.invoiceNumber} — figures can still change.`
                                            : "No invoice has been generated for this patient yet."}
                                    </div>
                                    <div className="font-medium">
                                        This is an estimate for reference only. Use Generate
                                        Invoice to save and finalize the real bill.
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Invoice meta — a real grid, so the four fields sit on the
                same baselines instead of drifting with flex-wrap. */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-2 print:gap-y-1 text-xs font-medium">
                            <Field
                                label={isFinalized ? "Invoice No." : "Reference"}
                                value={invoice?.invoiceNumber || "Not yet issued"}
                            />
                            <Field
                                label="Date"
                                value={fmtDate(invoice?.createdAt || new Date())}
                            />
                            <Field
                                label={`${type} No.`}
                                value={`#${full?.serialNumber || full?.tokenNumber || "—"}`}
                            />
                            <Field
                                label={isFinalized ? "Finalized By" : "Generated By"}
                                value={
                                    isFinalized
                                        ? invoice?.finalizedByName
                                        : invoice?.createdByName
                                }
                            />
                        </div>

                        {/* Patient */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-2 print:gap-y-1 text-xs font-medium border-y border-slate-100 dark:border-slate-800 py-3 print:py-2">
                            <Field label="Patient" value={full?.name} />
                            <Field label="Age" value={full?.age ? `${full.age} yrs` : "—"} />
                            <Field label="Gender" value={full?.gender} />
                            <Field label="Phone" value={full?.phone} />
                        </div>

                        {isIPD && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-2 print:gap-y-1 text-xs font-medium">
                                <Field label="Admitted" value={fmtDate(full?.admissionDate)} />
                                <Field label="Discharged" value={fmtDate(full?.dischargeDate)} />
                                <Field label="Status" value={full?.status} />
                                <Field label="Settlement" value={full?.settlementStatus} />
                            </div>
                        )}

                        {/* Charges */}
                        <div>
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-slate-800 dark:border-slate-200 text-left">
                                        <th className="py-1.5 print:py-1 pr-2 font-extrabold w-8">
                                            Sl.No
                                        </th>
                                        <th className="py-1.5 print:py-1 px-2 font-extrabold">
                                            Treatment
                                        </th>
                                        <th className="py-1.5 print:py-1 px-2 font-extrabold text-right w-16">
                                            Days
                                        </th>
                                        <th className="py-1.5 print:py-1 px-2 font-extrabold text-right w-24">
                                            Price
                                        </th>
                                        <th className="py-1.5 print:py-1 pl-2 font-extrabold text-right w-28">
                                            Amount
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="py-6 text-center text-slate-400 font-medium"
                                            >
                                                No charges recorded for this patient yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        lineItems.map((r, i) => (
                                            <tr
                                                key={r.id || i}
                                                className="border-b border-slate-100 dark:border-slate-800"
                                            >
                                                <td className="py-1.5 print:py-1 pr-2 text-slate-400 align-top">
                                                    {i + 1}
                                                </td>
                                                <td className="py-1.5 print:py-1 px-2 align-top whitespace-pre-wrap break-words font-medium">
                                                    {r.description}
                                                </td>
                                                <td className="py-1.5 print:py-1 px-2 text-right align-top font-medium">
                                                    {r.qty}
                                                </td>
                                                <td className="py-1.5 print:py-1 px-2 text-right align-top font-medium">
                                                    {r.rate}
                                                </td>
                                                <td className="py-1.5 print:py-1 pl-2 text-right font-extrabold align-top">
                                                    {fmtINR(
                                                        r.amount ??
                                                        (Number(r.qty) || 0) * (Number(r.rate) || 0),
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Settlement summary — reads top to bottom as the whole
                story: charges, what was handed over, what went back, what
                is left. */}
                        <div className="flex justify-end">
                            <div className="w-full sm:w-96 print:w-96 space-y-1 text-xs font-medium bg-slate-50/70 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl print:rounded-none p-3 print:p-2">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Charges Subtotal</span>
                                    <span className="font-extrabold">
                                        {fmtINR(totals.subtotal)}
                                    </span>
                                </div>

                                {totals.discountVal > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Discount</span>
                                        <span className="font-extrabold">
                                            − {fmtINR(totals.discountVal)}
                                        </span>
                                    </div>
                                )}

                                {gstPercent > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">GST ({gstPercent}%)</span>
                                        <span className="font-extrabold">
                                            {fmtINR(totals.gstAmount)}
                                        </span>
                                    </div>
                                )}

                                <div className="flex justify-between border-t-2 border-[#0f4a29] dark:border-[#52b788] pt-1 mt-1">
                                    <span className="font-extrabold">Total Bill</span>
                                    <span className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                                        {fmtINR(totals.grandTotal)}
                                    </span>
                                </div>

                                {/* Each payment on its own dated line, oldest first, then
                    the total — so the refund below can be read against what
                    was actually collected and when. */}
                                {hasPaymentRows ? (
                                    <>
                                        <div className="pt-1.5 mt-1.5 border-t border-slate-200 dark:border-slate-700">
                                            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wide">
                                                Payments Received
                                            </span>
                                        </div>
                                        {paymentRows.map((pm) => (
                                            <div key={pm.key} className="flex justify-between gap-2">
                                                <span className="text-slate-500 min-w-0">
                                                    {fmtDate(pm.paymentDate)}
                                                    <span className="text-slate-400">
                                                        {pm.label ? ` · ${pm.label}` : ""}
                                                        {pm.referenceNumber ? ` · ${pm.referenceNumber}` : ""}
                                                    </span>
                                                </span>
                                                <span className="font-extrabold shrink-0">
                                                    {fmtINR(pm.amount)}
                                                </span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                                            <span className="font-extrabold">
                                                Total Deposits
                                                <span className="block text-[9px] text-slate-400 font-medium leading-tight">
                                                    {paymentRows.length} payment
                                                    {paymentRows.length === 1 ? "" : "s"}
                                                </span>
                                            </span>
                                            <span className="font-extrabold">
                                                {fmtINR(totals.paidVal)}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex justify-between pt-1.5 mt-1.5 border-t border-slate-200 dark:border-slate-700">
                                        <span className="text-slate-500">Paid by Patient</span>
                                        <span className="font-extrabold">
                                            {fmtINR(totals.paidVal)}
                                        </span>
                                    </div>
                                )}

                                {/* Refund rows appear only when money actually went back. */}
                                {showRefund && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">
                                                Refund Returned to Patient
                                                {refundMethod ? ` (${refundMethod})` : ""}
                                            </span>
                                            <span className="font-extrabold text-sky-700 dark:text-sky-400">
                                                − {fmtINR(totals.refundVal)}
                                            </span>
                                        </div>
                                        {(refundReason || refundDate) && (
                                            <div className="text-[10px] text-slate-400 font-medium leading-tight">
                                                {refundReason ? `Reason: ${refundReason}` : "Refund"}
                                                {refundDate ? ` · Returned ${fmtDate(refundDate)}` : ""}
                                            </div>
                                        )}
                                        <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                                            <span className="font-extrabold">
                                                Amount Kept Against Bill
                                            </span>
                                            <span className="font-extrabold">
                                                {fmtINR(totals.netPaid)}
                                            </span>
                                        </div>
                                    </>
                                )}

                                <div className="flex justify-between border-t-2 border-slate-800 dark:border-slate-200 pt-1.5 mt-1.5">
                                    <span className="font-extrabold">{balanceLabel}</span>
                                    <span
                                        className={`font-extrabold ${totals.balance > 0
                                            ? "text-rose-500"
                                            : "text-[#0f4a29] dark:text-[#52b788]"
                                            }`}
                                    >
                                        {balanceValue}
                                    </span>
                                </div>

                                <p className="pt-1.5 mt-1 border-t border-dashed border-slate-200 dark:border-slate-700 text-[10px] leading-snug text-slate-500 dark:text-slate-400 font-medium">
                                    {settlementSentence}
                                </p>
                            </div>
                        </div>

                        {(paymentMethod || notes) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-4 gap-y-2 text-xs font-medium border-t border-slate-100 dark:border-slate-800 pt-3 print:pt-2">
                                {paymentMethod && (
                                    <Field label="Payment Method" value={paymentMethod} />
                                )}
                                {notes && (
                                    <div className="min-w-0">
                                        <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wide leading-tight">
                                            Notes
                                        </div>
                                        <div className="font-extrabold leading-tight whitespace-pre-wrap break-words">
                                            {notes}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!isFinalized && (
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl print:rounded-none px-3 py-1.5">
                                Proforma invoice — for reference only. This is not a tax
                                invoice and does not confirm payment.
                            </p>
                        )}

                        <div className="flex justify-end pt-6 print:pt-4">
                            <div className="text-center">
                                <div className="w-40 border-t border-slate-400 dark:border-slate-600 pt-1 text-[11px] font-bold text-slate-500">
                                    Authorized Signature
                                </div>
                            </div>
                        </div>

                        <div className="text-center border-t border-slate-200 dark:border-slate-800 pt-2">
                            <p className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                                {CLINIC.footerName}
                            </p>
                            <p className="text-[10px] text-slate-400 max-w-xl mx-auto leading-snug">
                                {CLINIC.footerAddress}
                            </p>
                        </div>

                        <div className="no-print flex flex-wrap justify-end gap-2 pt-2">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
                            >
                                <Printer className="w-4 h-4" /> Print {docLabel}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}