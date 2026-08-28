// client/src/pages/pharmacy/PharmacyMedicineDetails.jsx
import { useState } from "react";
import { PharmacyStatusBadge, getMedicineStatus } from "./PharmacyDashboard";
import { SectionCard, PageHeader } from "../../components/UI";
import {
  ArrowLeft,
  Pill,
  Package,
  DollarSign,
  Plus,
  Minus,
  RefreshCw,
} from "lucide-react";
import { api } from "../../lib/api";

export default function PharmacyMedicineDetails({
  medicine: initMed,
  onBack,
  onUpdated,
}) {
  const [med, setMed] = useState(initMed);
  const [stockAction, setStockAction] = useState("");
  const [stockStrips, setStockStrips] = useState("");
  const [stockTablets, setStockTablets] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [stockError, setStockError] = useState("");
  const [saving, setSaving] = useState(false);

  const status = getMedicineStatus(med);
  const hasPacking = !!med.tabletsPerStrip;

  const ACTION_LABELS = {
    add: "Add Stock",
    reduce: "Reduce Stock",
    adjust: "Stock Adjustment",
  };

  // Live preview of what the two fields above add up to, in tablets — same
  // math the server applies, shown here so the user can see the total
  // before confirming.
  const previewStrips = parseInt(stockStrips) || 0;
  const previewTablets = parseInt(stockTablets) || 0;
  const previewTotalTablets =
    previewStrips * (med.tabletsPerStrip || 1) + previewTablets;

  const handleStockUpdate = async () => {
    if (previewStrips <= 0 && previewTablets <= 0) {
      setStockError("Enter a quantity of Strips and/or Tablets.");
      return;
    }
    if (!stockReason.trim()) {
      setStockError("Enter a reason.");
      return;
    }
    if (stockAction === "reduce" && previewTotalTablets > med.quantity) {
      setStockError("Cannot reduce more than current stock.");
      return;
    }

    setSaving(true);
    setStockError("");
    try {
      const { medicine: updated } = await api.post(
        `/pharmacy/medicines/${med.id}/stock`,
        {
          action: ACTION_LABELS[stockAction],
          strips: previewStrips,
          tablets: previewTablets,
          reason: stockReason.trim(),
        },
      );
      setMed(updated);
      if (onUpdated) onUpdated(updated);
      setStockStrips("");
      setStockTablets("");
      setStockReason("");
      setStockAction("");
    } catch (err) {
      setStockError(err.message || "Could not update stock.");
    } finally {
      setSaving(false);
    }
  };

  const expiryDiff = med.expiryDate
    ? Math.ceil((new Date(med.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const stockPercent =
    med.initialQuantity > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((med.quantity / med.initialQuantity) * 100)),
        )
      : null;

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={med.drugName || "Unnamed Medicine"}
        subtitle={med.medicineType || ""}
        action={
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Inventory
          </button>
        }
      />

      <div className="flex items-center gap-2 max-w-6xl">
        <PharmacyStatusBadge status={status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-6xl">
        <SectionCard title="Tablet Information" icon={Pill}>
          <div className="grid grid-cols-2 gap-3 text-xs font-medium">
            {[
              { label: "Tablet Name", val: med.drugName },
              { label: "Medicine Type", val: med.medicineType },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                  {item.label}
                </div>
                <div className="text-slate-900 dark:text-white font-extrabold">
                  {item.val || "—"}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Pricing & Margin" icon={DollarSign}>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Purchase / Strip
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                ₹{med.purchasePrice}
              </div>
            </div>
            <div className="bg-[#0f4a29]/10 rounded-2xl p-3 border border-[#0f4a29]/20 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Selling / Strip
              </div>
              <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                ₹{med.sellingPrice}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Margin
              </div>
              <div className="font-extrabold text-xs text-slate-900 dark:text-white">
                {med.purchasePrice
                  ? `${(((med.sellingPrice - med.purchasePrice) / med.purchasePrice) * 100).toFixed(1)}%`
                  : "—"}
              </div>
            </div>
          </div>

          {/* Per-Tablet breakdown — already computed server-side (see
              pharmacy.mappers.js fromDbMedicine), just surfaced here. */}
          <div className="text-[10px] font-bold uppercase text-slate-400 mt-4 mb-2">
            Per Tablet Cost (Auto)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Purchase / Tablet
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                ₹{(med.purchasePricePerTablet || 0).toFixed(2)}
              </div>
            </div>
            <div className="bg-[#0f4a29]/10 rounded-2xl p-3 border border-[#0f4a29]/20">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Selling / Tablet
              </div>
              <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                ₹{(med.sellingPricePerTablet || 0).toFixed(2)}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Stock & Expiry" icon={Package}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                In Stock
              </div>
              <div className="font-extrabold text-base text-slate-900 dark:text-white">
                {med.quantity}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Reorder Level
              </div>
              <div className="font-extrabold text-base text-slate-900 dark:text-white">
                {med.reorderLevel || 0}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Purchase Date
              </div>
              <div className="font-extrabold text-xs text-slate-900 dark:text-white">
                {med.purchaseDate || "—"}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Expiry Date
              </div>
              <div className="font-extrabold text-xs text-slate-900 dark:text-white">
                {med.expiryDate
                  ? `${med.expiryDate} (${expiryDiff <= 0 ? "Expired" : `${expiryDiff} days`})`
                  : "—"}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Strip / Tablet Breakdown" icon={Pill}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-medium mb-4">
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                Tablets Per Strip
              </div>
              <div className="text-slate-900 dark:text-white font-extrabold">
                {med.tabletsPerStrip || "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                Total Strips (Purchased)
              </div>
              <div className="text-slate-900 dark:text-white font-extrabold">
                {med.totalStrips || 0}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                Total Tablets (Auto)
              </div>
              <div className="text-slate-900 dark:text-white font-extrabold">
                {med.totalTablets || 0}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                Initial Quantity
              </div>
              <div className="text-slate-900 dark:text-white font-extrabold">
                {med.initialQuantity || 0} tab
              </div>
            </div>
          </div>
          <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">
            Current / Available Stock
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Strips
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                {med.availableStrips}
              </div>
            </div>
            <div className="bg-[#0f4a29]/10 rounded-2xl p-3 border border-[#0f4a29]/20 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Tablets
              </div>
              <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                {med.availableTablets}
              </div>
            </div>
          </div>
          {stockPercent !== null && (
            <div>
              <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400 mb-1">
                <span>Stock Remaining</span>
                <span>
                  {med.quantity} / {med.initialQuantity} tablets ({stockPercent}
                  %)
                </span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    stockPercent <= 20
                      ? "bg-rose-500"
                      : "bg-[#0f4a29] dark:bg-[#52b788]"
                  }`}
                  style={{ width: `${stockPercent}%` }}
                />
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Stock Management Action */}
      <SectionCard title="Update Stock Level" icon={RefreshCw}>
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { key: "add", label: "Add Stock", icon: Plus },
            { key: "reduce", label: "Reduce Stock", icon: Minus },
            { key: "adjust", label: "Set Quantity", icon: RefreshCw },
          ].map((a) => {
            const Icon = a.icon;
            const active = stockAction === a.key;
            return (
              <button
                key={a.key}
                onClick={() => {
                  setStockAction(active ? "" : a.key);
                  setStockStrips("");
                  setStockTablets("");
                  setStockError("");
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold border transition-all ${
                  active
                    ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                    : "bg-white dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {a.label}
              </button>
            );
          })}
        </div>

        {stockAction && (
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                {stockAction === "adjust"
                  ? "Set Stock To (Strips + Tablets can both be used)"
                  : "Quantity — enter Strips and/or Tablets together"}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={stockStrips}
                    disabled={!hasPacking}
                    onChange={(e) => {
                      setStockStrips(e.target.value);
                      setStockError("");
                    }}
                    placeholder={
                      hasPacking ? "Strips" : "Strips (set Tablets/Strip first)"
                    }
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <input
                  type="number"
                  min="0"
                  value={stockTablets}
                  onChange={(e) => {
                    setStockTablets(e.target.value);
                    setStockError("");
                  }}
                  placeholder="Tablets (loose)"
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
              {(previewStrips > 0 || previewTablets > 0) && (
                <p className="text-[10px] font-bold text-[#0f4a29] dark:text-[#52b788] mt-1.5">
                  = {previewTotalTablets} tablet
                  {previewTotalTablets === 1 ? "" : "s"} total
                  {stockAction !== "adjust" &&
                    ` (${stockAction === "add" ? "adding to" : "removing from"} current ${med.quantity})`}
                </p>
              )}
            </div>
            <input
              type="text"
              value={stockReason}
              onChange={(e) => {
                setStockReason(e.target.value);
                setStockError("");
              }}
              placeholder="Reason (e.g. Dispensed / New Purchase)"
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
            />
            {stockError && (
              <p className="text-rose-500 text-xs font-bold">{stockError}</p>
            )}
            <button
              onClick={handleStockUpdate}
              disabled={saving}
              className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs disabled:opacity-50"
            >
              {saving ? "Updating..." : "Confirm Update"}
            </button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
