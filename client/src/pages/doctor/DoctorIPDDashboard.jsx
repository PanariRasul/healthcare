// client/src/pages/doctor/DoctorIPDDashboard.jsx
import IPDPatientList from "../ipd/IPDPatientList";
import { ShieldAlert } from "lucide-react";

export function DoctorIPDDashboard({ patients }) {
  return (
    <div className="space-y-4 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-full w-fit text-xs text-amber-800 dark:text-amber-400 font-extrabold">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        Read-only view — Doctor cannot add, edit, or delete patient records
      </div>
      <IPDPatientList patients={patients} setPatients={() => {}} readOnly />
    </div>
  );
}
