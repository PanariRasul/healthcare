// client/src/pages/ipd/IPDPatientForm.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageHeader,
  FormInput,
  FormSelect,
  FormTextarea,
  SectionCard,
} from "../../components/UI";
import {
  createPatient,
  updatePatient,
  uploadDocument,
  deleteDocument,
} from "./api/ipd.api";
import { api } from "../../lib/api";
import {
  User,
  BedDouble,
  CreditCard,
  BarChart3,
  Save,
  X,
  Plus,
  Minus,
  Pill,
  Upload,
  Paperclip,
  Trash2,
  AlertTriangle,
  Bell,
} from "lucide-react";

const DOC_TYPES = [
  "Prescription",
  "Lab Report",
  "Scan Report",
  "Hospital Bill",
];

const defaultForm = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  aadhar: "",
  admissionDate: new Date().toISOString().split("T")[0],
  admissionTime: new Date().toTimeString().slice(0, 5),
  deposit: "",
  cash: "",
  upi: "",
  card: "",
  dailyCharges: [
    {
      id: Date.now(),
      date: new Date().toISOString().split("T")[0],
      days: "",
      rate: "",
      amount: 0,
    },
  ],
  medicines: [],
  oil: "0",
  protein: "0",
  syrup: "0",
  expectedDays: "",
  dischargeDate: "",
  dischargeTime: "",
  notes: "",
  dischargeStatus: "Admitted",
  followUpDate: "",
  condition: "",
  followUpDesc: "",
  followUpStatus: "Pending",
  reminderEnabled: false,
  reminderStatus: "Not Set",
  reminderSentDate: "",
};

const toDateInput = (d) => (d ? new Date(d).toISOString().split("T")[0] : "");

export default function IPDPatientForm({ editPatient, onDone }) {
  const [form, setForm] = useState(
    editPatient
      ? {
          ...editPatient,
          admissionDate: toDateInput(editPatient.admissionDate),
          dischargeDate: toDateInput(editPatient.dischargeDate),
          card: editPatient.card || 0,
          dailyCharges: (editPatient.dailyCharges || []).map((c) => ({
            ...c,
            date: toDateInput(c.date),
          })),
          medicines: editPatient.medicines || [],
          followUpDate: toDateInput(editPatient.followUpDate),
          condition: editPatient.condition || "",
          followUpDesc: editPatient.followUpDesc || "",
          followUpStatus: editPatient.followUpStatus || "Pending",
          reminderEnabled: editPatient.reminderEnabled || false,
          reminderStatus: editPatient.reminderStatus || "Not Set",
          reminderSentDate: toDateInput(editPatient.reminderSentDate),
        }
      : defaultForm,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [medicinesList, setMedicinesList] = useState([]);
  const [medicinesLoading, setMedicinesLoading] = useState(true);

  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [rxQuantity, setRxQuantity] = useState("");
  const [rxDescription, setRxDescription] = useState("");
  const [rxError, setRxError] = useState("");

  useEffect(() => {
    (async () => {
      setMedicinesLoading(true);
      try {
        const { medicines } = await api.get("/pharmacy/medicines");
        setMedicinesList(medicines);
      } catch (err) {
        setRxError(err.message || "Could not load medicine list.");
      } finally {
        setMedicinesLoading(false);
      }
    })();
  }, []);

  const [existingDocs, setExistingDocs] = useState(
    editPatient?.documents || [],
  );
  const [pendingDocs, setPendingDocs] = useState([]);
  const [docType, setDocType] = useState(DOC_TYPES[0]);

  const set = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));

  const deposit = parseFloat(form.deposit) || 0;
  const cash = parseFloat(form.cash) || 0;
  const upi = parseFloat(form.upi) || 0;
  const card = parseFloat(form.card) || 0;
  const totalPaid = deposit + cash + upi + card;

  const updateCharge = (i, field, val) => {
    const charges = [...form.dailyCharges];
    charges[i] = { ...charges[i], [field]: val };
    charges[i].amount =
      (parseFloat(charges[i].days) || 0) * (parseFloat(charges[i].rate) || 0);
    setForm((f) => ({ ...f, dailyCharges: charges }));
  };
  const addCharge = () =>
    setForm((f) => ({
      ...f,
      dailyCharges: [
        ...f.dailyCharges,
        {
          id: Date.now(),
          date: new Date().toISOString().split("T")[0],
          days: "",
          rate: "",
          amount: 0,
        },
      ],
    }));
  const removeCharge = (i) =>
    setForm((f) => ({
      ...f,
      dailyCharges: f.dailyCharges.filter((_, idx) => idx !== i),
    }));

  const totalStay = form.dailyCharges.reduce(
    (s, p) => s + (parseFloat(p.amount) || 0),
    0,
  );

  const selectedMedicine = medicinesList.find(
    (m) => m.id === selectedMedicineId,
  );

  const handleAddMedicine = () => {
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

    setForm((f) => ({
      ...f,
      medicines: [
        ...f.medicines,
        {
          id: `temp-${Date.now()}`,
          medicineId: selectedMedicineId,
          name: selectedMedicine?.drugName || "Medicine",
          quantity: qty,
          unit: "Tablets",
          instructions: rxDescription.trim(),
        },
      ],
    }));
    setSelectedMedicineId("");
    setRxQuantity("");
    setRxDescription("");
  };

  const removeMedicine = (id) =>
    setForm((f) => ({
      ...f,
      medicines: f.medicines.filter((m) => m.id !== id),
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      ...form,
      age: parseInt(form.age),
      deposit: parseFloat(form.deposit) || 0,
      cash,
      upi,
      card,
      dailyCharges: form.dailyCharges.map((c) => ({
        date: c.date,
        days: parseFloat(c.days) || 0,
        rate: parseFloat(c.rate) || 0,
        amount: parseFloat(c.amount) || 0,
      })),
      medicines: form.medicines.map((m) => ({
        medicineId: m.medicineId || null,
        name: m.name,
        quantity: parseFloat(m.quantity) || 0,
        unit: m.unit || "Tablets",
        instructions: m.instructions || "",
      })),
    };

    try {
      const saved = editPatient
        ? await updatePatient(editPatient.id, payload)
        : await createPatient(payload);

      if (pendingDocs.length) {
        for (const doc of pendingDocs) {
          await uploadDocument(saved.id, doc.file, doc.type);
        }
      }

      if (onDone) onDone();
      else navigate("/ipd/patients");
    } catch (err) {
      setError(err.message || "Failed to save patient");
    } finally {
      setSaving(false);
    }
  };

  const back = () => (onDone ? onDone() : navigate("/ipd/patients"));

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={editPatient ? "Edit Patient Admission" : "Admit New Patient"}
        subtitle="Complete inpatient registration, room charges, and prescribed medications"
      />

      <form onSubmit={handleSubmit} className="space-y-5 max-w-5xl mx-auto">
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
              placeholder="Age"
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
              label="Phone Number"
              value={form.phone}
              onChange={set("phone")}
              placeholder="Mobile number"
            />
            <FormInput
              label="Aadhar Number"
              value={form.aadhar}
              onChange={set("aadhar")}
              placeholder="XXXX-XXXX-XXXX"
            />
          </div>
        </SectionCard>

        <SectionCard title="Admission Details" icon={BedDouble}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormInput
              label="Admission Date"
              type="date"
              value={form.admissionDate}
              onChange={set("admissionDate")}
            />
            <FormInput
              label="Admission Time"
              type="time"
              value={form.admissionTime}
              onChange={set("admissionTime")}
            />
            <FormInput
              label="Expected Stay (Days)"
              type="number"
              value={form.expectedDays}
              onChange={set("expectedDays")}
              placeholder="Days"
            />
            <FormInput
              label="Discharge Date"
              type="date"
              value={form.dischargeDate}
              onChange={set("dischargeDate")}
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
                  {medicinesList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.drugName}
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
                  onClick={handleAddMedicine}
                  className="w-full py-2 bg-[#0f4a29] text-white text-xs font-extrabold rounded-full shadow-xs"
                >
                  + Add Tablet
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {form.medicines.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {item.name} × {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMedicine(item.id)}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormInput
              label="Deposit (₹)"
              type="number"
              value={form.deposit}
              onChange={set("deposit")}
              placeholder="0.00"
            />
            <FormInput
              label="Cash (₹)"
              type="number"
              value={form.cash}
              onChange={set("cash")}
              placeholder="0.00"
            />
            <FormInput
              label="UPI (₹)"
              type="number"
              value={form.upi}
              onChange={set("upi")}
              placeholder="0.00"
            />
            <FormInput
              label="Card (₹)"
              type="number"
              value={form.card}
              onChange={set("card")}
              placeholder="0.00"
            />
          </div>
        </SectionCard>

        <div className="flex gap-2 justify-end pt-3">
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
              : editPatient
                ? "Update Patient"
                : "Admit Patient"}
          </button>
        </div>
      </form>
    </div>
  );
}
