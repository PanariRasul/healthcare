// client/src/pages/pharmacy/PharmacyMedicineForm.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  PageHeader,
  FormInput,
  FormTextarea,
  SectionCard,
} from "../../components/UI";
import {
  Pill,
  Package,
  DollarSign,
  Truck,
  FileText,
  Save,
  X,
  Plus,
  Loader2,
  Layers,
  Copy,
} from "lucide-react";
import { api } from "../../lib/api";

const defaultForm = {
  serialNumber: "",
  drugName: "",
  genericName: "",
  category: "",
  manufacturer: "",
  batchNumber: "",
  purchasePrice: "",
  sellingPrice: "",
  quantity: "",
  reorderLevel: "",
  expiryDate: "",
  supplierName: "",
  notes: "",
};

function AddCategoryModal({ onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Enter a category name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { category } = await api.post("/pharmacy/categories", {
        name: name.trim(),
      });
      onCreated(category);
    } catch (err) {
      setError(err.message || "Could not create category.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 max-w-sm w-full shadow-2xl space-y-4">
        <h3 className="text-slate-900 dark:text-white font-extrabold text-sm">
          Add New Category
        </h3>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          placeholder="Category name (e.g. Antibiotics)"
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
        />
        {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs font-bold text-slate-500 px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs"
          >
            {saving ? "Saving..." : "Save Category"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingMedicines, setExistingMedicines] = useState([]);
  const navigate = useNavigate();

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

  useEffect(() => {
    if (editMedicine || needsFetch) return;
    (async () => {
      try {
        const { medicines: data } = await api.get("/pharmacy/medicines");
        setExistingMedicines(data);
      } catch {}
    })();
  }, [editMedicine, needsFetch]);

  const typed = form.drugName.trim().toLowerCase();
  const matchedGroups =
    typed.length >= 3
      ? Object.values(
          existingMedicines
            .filter((m) => m.drugName.toLowerCase().includes(typed))
            .reduce((groups, m) => {
              const key = m.drugName.trim().toLowerCase();
              (groups[key] ||= {
                drugName: m.drugName,
                batches: [],
              }).batches.push(m);
              return groups;
            }, {}),
        )
      : [];

  const useAsTemplate = (m) => {
    setForm((f) => ({
      ...f,
      drugName: m.drugName,
      genericName: m.genericName || "",
      category: m.category || "",
      manufacturer: m.manufacturer || "",
      purchasePrice: m.purchasePrice ?? "",
      sellingPrice: m.sellingPrice ?? "",
      reorderLevel: m.reorderLevel ?? "",
      supplierName: m.supplierName || "",
      notes: m.notes || "",
    }));
  };

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const { categories: data } = await api.get("/pharmacy/categories");
      setCategories(data);
    } catch (err) {
      setError(err.message || "Could not load categories.");
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const set = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));

  const handleCategoryCreated = (category) => {
    setCategories((cats) =>
      [...cats, category].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setForm((f) => ({ ...f, category: category.name }));
    setShowAddCategory(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (activeEditMedicine) {
      const payload = {
        ...form,
        purchasePrice: parseFloat(form.purchasePrice) || 0,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        quantity: parseInt(form.quantity) || 0,
        reorderLevel: parseInt(form.reorderLevel) || 0,
      };
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
        else navigate("/pharmacy/medicines");
      } catch (err) {
        setError(err.message || "Could not update medicine.");
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      await api.post("/pharmacy/medicines", form);
      if (onDone) onDone();
      else navigate("/pharmacy/medicines");
    } catch (err) {
      setError(err.message || "Could not add medicine.");
      setSaving(false);
    }
  };

  const back = () => (onDone ? onDone() : navigate("/pharmacy/medicines"));

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
        subtitle="Pharmacy inventory stock, pricing, and batch details"
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 max-w-7xl mx-auto">
        <SectionCard title="Drug Details" icon={Pill}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormInput
              label="Serial / Medicine ID"
              value={form.serialNumber}
              onChange={set("serialNumber")}
              placeholder="MED-001"
              required
            />
            <FormInput
              label="Drug Name"
              value={form.drugName}
              onChange={set("drugName")}
              placeholder="e.g. Paracetamol 500mg"
              required
            />
            <FormInput
              label="Generic Name"
              value={form.genericName}
              onChange={set("genericName")}
              placeholder="e.g. Acetaminophen"
            />

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Category<span className="text-rose-500 ml-1">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={(e) => set("category")(e.target.value)}
                  required
                  disabled={categoriesLoading}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                >
                  <option value="">Select...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddCategory(true)}
                  className="px-3 py-2 bg-[#0f4a29] text-white text-xs font-extrabold rounded-xl shadow-xs"
                >
                  + Add
                </button>
              </div>
            </div>

            <FormInput
              label="Manufacturer"
              value={form.manufacturer}
              onChange={set("manufacturer")}
              placeholder="e.g. Sun Pharma"
            />
            <FormInput
              label="Batch Number"
              value={form.batchNumber}
              onChange={set("batchNumber")}
              placeholder="e.g. BTH-2024-001"
              required
            />
          </div>
        </SectionCard>

        <SectionCard title="Pricing & Stock" icon={DollarSign}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormInput
              label="Purchase Price (₹)"
              type="number"
              value={form.purchasePrice}
              onChange={set("purchasePrice")}
              placeholder="0.00"
              required
            />
            <FormInput
              label="Selling Price (₹)"
              type="number"
              value={form.sellingPrice}
              onChange={set("sellingPrice")}
              placeholder="0.00"
              required
            />
            <FormInput
              label="Quantity In Stock"
              type="number"
              value={form.quantity}
              onChange={set("quantity")}
              placeholder="0"
              required
            />
            <FormInput
              label="Expiry Date"
              type="date"
              value={form.expiryDate}
              onChange={set("expiryDate")}
              required
            />
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

      {showAddCategory && (
        <AddCategoryModal
          onCancel={() => setShowAddCategory(false)}
          onCreated={handleCategoryCreated}
        />
      )}
    </div>
  );
}
