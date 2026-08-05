// client/src/pages/admin/biometric/BiometricStaffEmployee.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { PageHeader, SectionCard, SearchBar } from "../../../components/UI";
import { Fingerprint, Check, X, Loader2 } from "lucide-react";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  required,
}) {
  return (
    <div>
      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29] disabled:opacity-60"
      />
    </div>
  );
}

export default function BiometricStaffEmployee() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const mode = searchParams.get("mode") === "edit" ? "edit" : "add";
  const mappingId = searchParams.get("id");
  const prefillPersonId = searchParams.get("personId");
  const isEdit = mode === "edit";

  const [type, setType] = useState(
    searchParams.get("type") === "employee" ? "employee" : "user",
  );
  const isUser = type === "user";

  const [devices, setDevices] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [deviceId, setDeviceId] = useState("");
  const [biometricId, setBiometricId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(isEdit || Boolean(prefillPersonId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { devices: data } = await api.get("/biometric/devices");
        setDevices(data);
      } catch (err) {
        setError(err.message || "Could not load devices.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!isEdit || !mappingId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { mapping } = await api.get(`/biometric/mappings/${mappingId}`);
        setType(mapping.userId ? "user" : "employee");
        setSelectedPerson(mapping.userId ? mapping.user : mapping.employee);
        setDeviceId(mapping.deviceId);
        setBiometricId(mapping.biometricId);
        setIsActive(mapping.isActive);
      } catch (err) {
        setError(err.message || "Could not load this mapping.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, mappingId]);

  useEffect(() => {
    if (isEdit || !prefillPersonId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const endpoint = isUser ? "/biometric/users" : "/biometric/employees";
        const { users, employees } = await api.get(
          `${endpoint}?id=${encodeURIComponent(prefillPersonId)}`,
        );
        const list = isUser ? users : employees;
        setSelectedPerson(list?.[0] || null);
      } catch (err) {
        setError(err.message || "Could not load the selected person.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, prefillPersonId, isUser]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setError("");
    try {
      const endpoint = isUser ? "/biometric/users" : "/biometric/employees";
      const { users, employees } = await api.get(
        `${endpoint}?search=${encodeURIComponent(personSearch)}`,
      );
      setPersonResults(isUser ? users : employees);
    } catch (err) {
      setError(err.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }, [isUser, personSearch]);

  const backToList = () => {
    navigate(
      `/admin/biometric?tab=${isUser ? "userMapping" : "employeeMapping"}`,
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!selectedPerson)
      return setError(
        `Please select a ${isUser ? "staff member" : "employee"} to map.`,
      );
    if (!deviceId) return setError("Please select a device.");
    if (!biometricId) return setError("Biometric ID is required.");

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/biometric/mappings/${mappingId}`, {
          deviceId,
          biometricId,
          isActive,
        });
      } else {
        await api.post("/biometric/mappings", {
          biometricId,
          deviceId,
          ...(isUser
            ? { userId: selectedPerson.id }
            : { employeeId: selectedPerson.id }),
        });
      }
      backToList();
    } catch (err) {
      setError(err.message || "Could not save this mapping.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={`${isEdit ? "Edit" : "Add"} ${isUser ? "Staff" : "Employee"} Biometric Mapping`}
        subtitle="Map hardware biometric IDs to staff accounts or workforce directory records"
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            mapping details...
          </div>
        </div>
      ) : (
        <SectionCard title="Mapping Information" icon={Fingerprint}>
          <form onSubmit={handleSave} className="space-y-5">
            {/* Person Type Switcher */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Mapping Type
              </label>
              <div className="flex gap-2">
                {["user", "employee"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={isEdit}
                    onClick={() => {
                      setType(t);
                      setSelectedPerson(null);
                      setPersonResults([]);
                    }}
                    className={`px-4 py-2 rounded-full text-xs font-extrabold border transition-all ${
                      type === t
                        ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                        : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {t === "user" ? "Staff User" : "Workforce Employee"}
                  </button>
                ))}
              </div>
            </div>

            {/* Select Person */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Select {isUser ? "Staff Member" : "Employee"}
              </label>

              {selectedPerson ? (
                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                  <div>
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {selectedPerson.fullName}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {isUser
                        ? `${selectedPerson.role || ""} ${selectedPerson.email ? "· " + selectedPerson.email : ""}`
                        : selectedPerson.designation}
                    </p>
                  </div>
                  {!isEdit && (
                    <button
                      type="button"
                      onClick={() => setSelectedPerson(null)}
                      className="text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <SearchBar
                      value={personSearch}
                      onChange={setPersonSearch}
                      placeholder={`Search ${isUser ? "staff" : "employee"}...`}
                    />
                    <button
                      type="button"
                      onClick={runSearch}
                      disabled={searching}
                      className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs"
                    >
                      {searching ? "Searching..." : "Search"}
                    </button>
                  </div>
                  {personResults.length > 0 && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl max-h-48 overflow-y-auto">
                      {personResults.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => {
                            setSelectedPerson(p);
                            setPersonResults([]);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {p.fullName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {isUser ? `${p.role} · ${p.email}` : p.designation}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Device & Biometric ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                  Assigned Device
                </label>
                <select
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                >
                  <option value="">Select hardware device</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.deviceCode})
                    </option>
                  ))}
                </select>
              </div>

              <Field
                label="Biometric Hardware ID"
                value={biometricId}
                onChange={setBiometricId}
                placeholder="Enrollment / Card Number"
                required
              />
            </div>

            {/* Status Switcher */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Status
              </label>
              <div className="flex gap-2">
                {[
                  { v: true, label: "Active" },
                  { v: false, label: "Inactive" },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => setIsActive(opt.v)}
                    className={`px-4 py-2 rounded-full text-xs font-extrabold border transition-all ${
                      isActive === opt.v
                        ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                        : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-2 justify-end pt-3">
              <button
                type="button"
                onClick={backToList}
                className="text-xs font-bold text-slate-500 px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />{" "}
                {saving ? "Saving..." : "Save Mapping"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}
