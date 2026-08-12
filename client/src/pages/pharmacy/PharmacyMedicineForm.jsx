// client/src/pages/pharmacy/PharmacyMedicineForm.jsx
//
// Simplified add/edit form — every field is optional, and only the fields
// that actually matter for a strip-based tablet inventory are shown:
// Tablet Name, Purchase Price (per strip), Selling Price (per strip),
// Total Strips, Tablets Per Strip. Total Tablets, Per Tablet Cost, and
// Per Tablet Selling Price are all auto-calculated and read-only.
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader, FormInput, SectionCard } from "../../components/UI";
import { Pill, DollarSign, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const MEDICINE_TYPES = [
  "General Medicine",
  "Ayurvedic Medicine",
  "Surgical Medicine",
];

const defaultForm = {
  drugName: "",
  medicineType: "General Medicine",
  purchasePrice: "",
  sellingPrice: "",
  totalStrips: "",
  tabletsPerStrip: "",
  purchaseDate: "",
  expiryDate: "",
};

export default function PharmacyMedicineForm({
  medicines,
  setMedicines,
  editMedicine,
  onDone,
}) {
  const { id: routeId } = useParams();
  const needsFetch = !editMedicine && !!routeId;
  const [fetchedMedicine, setFetchedMedicine] = useState(null);
  const [fetchingMedicine, setFetchingMedicine] = useState(needsFetch);
  const [fetchError, setFetchError] = useState("");

  const activeEditMedicine = editMedicine || fetchedMedicine;

  const [form, setForm] = useState(editMedicine || defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  // Admin uses /admin/pharmacy/*, the Pharmacy role uses /pharmacy/*. When
  // no onDone callback is passed (i.e. this form is reached directly via a
  // route rather than embedded in another page), fall back to whichever
  // path matches the current user's role instead of always /pharmacy/*.
  const base = user?.role === "admin" ? "/admin/pharmacy" : "/pharmacy";

  useEffect(() => {
    if (!needsFetch) return;
    (async () => {
      setFetchingMedicine(true);
      setFetchError("");
      try {
        const { medicine } = await api.get(`/pharmacy/medicines/${routeId}`);
        setFetchedMedicine(medicine);
        setForm(medicine);
      } catch (err) {
        setFetchError(err.message || "Could not load this medicine.");
      } finally {
        setFetchingMedicine(false);
      }
    })();
  }, [routeId]);

  const set = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));

  // Auto-calculated, read-only preview — recomputed on every render from
  // whatever's currently typed. Nothing here is persisted directly; the
  // server recomputes the same values on save.
  const tabletsPerStripNum = parseInt(form.tabletsPerStrip, 10) || 0;
  const totalStripsNum = parseInt(form.totalStrips, 10) || 0;
  const computedTotalTablets = totalStripsNum * tabletsPerStripNum;

  const purchasePriceNum = parseFloat(form.purchasePrice) || 0;
  const sellingPriceNum = parseFloat(form.sellingPrice) || 0;
  const purchasePricePerTablet = tabletsPerStripNum
    ? purchasePriceNum / tabletsPerStripNum
    : 0;
  const sellingPricePerTablet = tabletsPerStripNum
    ? sellingPriceNum / tabletsPerStripNum
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      drugName: form.drugName || "",
      medicineType: form.medicineType || "General Medicine",
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      totalStrips: parseInt(form.totalStrips, 10) || 0,
      tabletsPerStrip: parseInt(form.tabletsPerStrip, 10) || 0,
      purchaseDate: form.purchaseDate || "",
      expiryDate: form.expiryDate || "",
    };

    if (activeEditMedicine) {
      try {
        const { medicine: updated } = await api.put(
          `/pharmacy/medicines/${activeEditMedicine.id}`,
          payload,
        );
        if (setMedicines) {
          setMedicines((ms) =>
            ms.map((m) => (m.id === updated.id ? updated : m)),
          );
        }
        if (onDone) onDone(updated);
        else navigate(`${base}/medicines`);
      } catch (err) {
        setError(err.message || "Could not update medicine.");
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      await api.post("/pharmacy/medicines", payload);
      if (onDone) onDone();
      else navigate(`${base}/medicines`);
    } catch (err) {
      setError(err.message || "Could not add medicine.");
      setSaving(false);
    }
  };

  const back = () => (onDone ? onDone() : navigate(`${base}/medicines`));

  if (fetchingMedicine) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          medicine...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={activeEditMedicine ? "Edit Medicine Record" : "Add New Medicine"}
        subtitle="Tablet name, pricing, and strip/tablet stock"
      />

      {(error || fetchError) && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error || fetchError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl mx-auto">
        <SectionCard title="Tablet Details" icon={Pill}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Tablet Name"
              value={form.drugName}
              onChange={set("drugName")}
              placeholder="e.g. Paracetamol 500mg"
            />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Medicine Type
            </label>
            <div className="flex flex-wrap gap-2">
              {MEDICINE_TYPES.map((t) => {
                const active = form.medicineType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("medicineType")(t)}
                    className={`px-4 py-2 rounded-full text-xs font-extrabold border transition-all ${
                      active
                        ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                        : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Pricing & Stock (Per Strip)" icon={DollarSign}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormInput
              label="Purchase Price Per Strip (₹)"
              type="number"
              value={form.purchasePrice}
              onChange={set("purchasePrice")}
              placeholder="0.00"
            />
            <FormInput
              label="Selling Price Per Strip (₹)"
              type="number"
              value={form.sellingPrice}
              onChange={set("sellingPrice")}
              placeholder="0.00"
            />
            <FormInput
              label="Total Strips"
              type="number"
              value={form.totalStrips}
              onChange={set("totalStrips")}
              placeholder="e.g. 20"
            />
            <FormInput
              label="Tablets Per Strip"
              type="number"
              value={form.tabletsPerStrip}
              onChange={set("tabletsPerStrip")}
              placeholder="e.g. 10"
            />
            <FormInput
              label="Purchase Date"
              type="date"
              value={form.purchaseDate}
              onChange={set("purchaseDate")}
            />
            <FormInput
              label="Expiry Date"
              type="date"
              value={form.expiryDate}
              onChange={set("expiryDate")}
            />
          </div>

          {/* Auto-calculated preview — purely derived from the fields
              above, e.g. a ₹100 strip of 10 tablets = ₹10/tablet cost.
              Recomputes live; nothing here is entered directly. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div className="bg-[#0f4a29]/10 rounded-2xl p-3 border border-[#0f4a29]/20">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Total Tablets (Auto)
              </div>
              <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                {computedTotalTablets}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Per Tablet Cost (Auto)
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                ₹{purchasePricePerTablet.toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Per Tablet Selling Price (Auto)
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                ₹{sellingPricePerTablet.toFixed(2)}
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={back}
            className="text-xs font-bold text-slate-500 px-5 py-2.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs"
          >
            {saving
              ? "Saving..."
              : activeEditMedicine
                ? "Update Medicine"
                : "Add Medicine"}
          </button>
        </div>
      </form>
    </div>
  );
}
