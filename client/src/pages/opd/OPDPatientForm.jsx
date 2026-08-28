// client/src/pages/opd/OPDPatientForm.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  PageHeader,
  FormInput,
  FormSelect,
  FormTextarea,
  SectionCard,
} from "../../components/UI";
import {
  User,
  CreditCard,
  ClipboardList,
  Save,
  X,
  Loader2,
  Pill,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const emptyForm = {
  name: "",
  age: "",
  gender: "",
  place: "",
  phone: "",
  cash: "",
  upi: "",
  visitDate: new Date().toISOString().split("T")[0],
  notes: "",
  followUpDate: "",
  condition: "",
  followUpDesc: "",
  followUpStatus: "Pending",
  reminderEnabled: false,
  reminderStatus: "Not Set",
  reminderSentDate: "",
  diagnosis: "",
  prescription: "",
  doctorNotes: "",
};

export default function OPDPatientForm({ editPatient, onDone }) {
  const { id: routeId } = useParams();
  const patientId = editPatient?.id || routeId || null;

  const [form, setForm] = useState(editPatient || emptyForm);
  const [serialNumber, setSerialNumber] = useState(
    editPatient?.serialNumber || null,
  );
  const [loading, setLoading] = useState(!!patientId && !editPatient);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const patientsPath =
    user?.role === "doctor" ? "/doctor/opd/patients" : "/opd/patients";

  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [medicinesLoading, setMedicinesLoading] = useState(true);
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [rxQuantity, setRxQuantity] = useState("");
  const [rxDescription, setRxDescription] = useState("");
  const [rxSaving, setRxSaving] = useState(false);
  const [rxError, setRxError] = useState("");

  useEffect(() => {
    if (!patientId || editPatient) return;
    (async () => {
      setLoading(true);
      try {
        const { patient } = await api.get(`/opd/patients/${patientId}`);
        setForm(patient);
        setSerialNumber(patient.serialNumber);
        setPrescriptionItems(patient.prescribedMedicines || []);
      } catch (err) {
        setError(err.message || "Could not load this patient.");
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]);

  useEffect(() => {
    (async () => {
      setMedicinesLoading(true);
      try {
        const { medicines } = await api.get("/pharmacy/medicines");
        setMedicineOptions(medicines);
      } catch (err) {
        setRxError(err.message || "Could not load medicine list.");
      } finally {
        setMedicinesLoading(false);
      }
    })();
  }, []);

  const set = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));
  const cash = parseFloat(form.cash) || 0;
  const upi = parseFloat(form.upi) || 0;
  const total = cash + upi;

  const handleAddPrescriptionItem = async () => {
    setRxError("");
    if (!selectedMedicineId) {
      setRxError("Select a medicine.");
      return;
    }
    const qty = parseInt(rxQuantity, 10);
    if (!qty || qty <= 0) {
      setRxError("Enter a valid quantity.");
      return;
    }

    const selectedMedicine = medicineOptions.find(
      (m) => m.id === selectedMedicineId,
    );

    if (patientId) {
      setRxSaving(true);
      try {
        const { patient: updated } = await api.post(
          `/opd/patients/${patientId}/prescriptions`,
          {
            medicineId: selectedMedicineId,
            quantity: qty,
            dosageInstructions: rxDescription.trim(),
          },
        );
        setPrescriptionItems(updated.prescribedMedicines || []);
        setSelectedMedicineId("");
        setRxQuantity("");
        setRxDescription("");
      } catch (err) {
        setRxError(err.message || "Could not add prescribed medicine.");
      } finally {
        setRxSaving(false);
      }
    } else {
      setPrescriptionItems((items) => [
        ...items,
        {
          tempId: `temp-${Date.now()}`,
          medicineId: selectedMedicineId,
          drugName: selectedMedicine?.drugName || "Medicine",
          quantity: qty,
          dosageInstructions: rxDescription.trim(),
        },
      ]);
      setSelectedMedicineId("");
      setRxQuantity("");
      setRxDescription("");
    }
  };

  const handleRemovePrescriptionItem = async (item) => {
    const key = item.id || item.tempId;
    if (item.id) {
      try {
        await api.del(`/opd/patients/${patientId}/prescriptions/${item.id}`);
        setPrescriptionItems((items) =>
          items.filter((i) => (i.id || i.tempId) !== key),
        );
      } catch (err) {
        setRxError(err.message || "Could not delete this prescription.");
      }
    } else {
      setPrescriptionItems((items) =>
        items.filter((i) => (i.id || i.tempId) !== key),
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (patientId) {
        await api.put(`/opd/patients/${patientId}`, form);
        if (onDone) onDone();
        else navigate(patientsPath);
        return;
      }

      const { patient: created } = await api.post("/opd/patients", form);

      for (const item of prescriptionItems.filter((i) => !i.id)) {
        await api.post(`/opd/patients/${created.id}/prescriptions`, {
          medicineId: item.medicineId,
          quantity: item.quantity,
          dosageInstructions: item.dosageInstructions,
        });
      }

      if (onDone) onDone();
      else navigate(patientsPath);
    } catch (err) {
      setError(err.message || "Could not save patient.");
      setSaving(false);
    }
  };

  const back = () => (onDone ? onDone() : navigate(patientsPath));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          patient details...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={patientId ? "Edit OPD Patient" : "Register OPD Patient"}
        subtitle="Outpatient consultation registration and billing details"
      />

      <form onSubmit={handleSubmit} className="space-y-5  mx-auto">
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
            {error}
          </div>
        )}

        <SectionCard title="Personal Details" icon={User}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormInput
              label="Patient Name"
              value={form.name}
              onChange={set("name")}
              placeholder="Full name"
              required
            />
            <FormInput
              label="Age"
              type="number"
              value={form.age}
              onChange={set("age")}
              placeholder="Age in years"
              required
            />
            <FormSelect
              label="Gender"
              value={form.gender}
              onChange={set("gender")}
              options={["Male", "Female", "Other"]}
              required
            />
            <FormInput
              label="Place"
              value={form.place}
              onChange={set("place")}
              placeholder="City / Town"
            />
            <FormInput
              label="Phone Number"
              value={form.phone}
              onChange={set("phone")}
              placeholder="10-digit mobile"
            />
          </div>
        </SectionCard>

        <SectionCard title="Visit Details" icon={ClipboardList}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Visit Date"
              type="date"
              value={form.visitDate}
              onChange={set("visitDate")}
            />
            <FormInput
              label="Follow-Up Date"
              type="date"
              value={form.followUpDate}
              onChange={set("followUpDate")}
            />
            <FormSelect
              label="Condition"
              value={form.condition}
              onChange={set("condition")}
              options={[
                "Stable",
                "Improving",
                "Chronic",
                "Mild",
                "Good",
                "Critical",
              ]}
            />
            <FormSelect
              label="Follow-Up Status"
              value={form.followUpStatus}
              onChange={set("followUpStatus")}
              options={["Pending", "Completed", "Missed"]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Prescribed Medicines" icon={Pill}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Medicine
                </label>
                <select
                  value={selectedMedicineId}
                  onChange={(e) => setSelectedMedicineId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
                >
                  <option value="">Select...</option>
                  {medicineOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.drugName} ({m.quantity} in stock)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  value={rxQuantity}
                  onChange={(e) => setRxQuantity(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddPrescriptionItem}
                  className="w-full py-2 bg-[#0f4a29] text-white text-xs font-extrabold rounded-full shadow-xs"
                >
                  + Add Tablet
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {prescriptionItems.map((item) => (
                <div
                  key={item.id || item.tempId}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {item.drugName} × {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePrescriptionItem(item)}
                    className="text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Payment Details" icon={CreditCard}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormInput
              label="Cash Amount (₹)"
              type="number"
              value={form.cash}
              onChange={set("cash")}
              placeholder="0.00"
            />
            <FormInput
              label="UPI Amount (₹)"
              type="number"
              value={form.upi}
              onChange={set("upi")}
              placeholder="0.00"
            />
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Total Amount
              </label>
              <div className="bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-xl px-4 py-2 text-[#0f4a29] dark:text-[#52b788] font-extrabold text-base">
                ₹{total.toLocaleString()}
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
              : patientId
                ? "Update Patient"
                : "Register Patient"}
          </button>
        </div>
      </form>
    </div>
  );
}
