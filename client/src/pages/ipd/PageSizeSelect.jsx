// client/src/pages/ipd/PageSizeSelect.jsx
//
// Small "Show N per page" dropdown shared by IPDPatientList and
// IPDDischargeList so both tables offer the same page-size choices.
export const PAGE_SIZE_OPTIONS = [10, 25, 40, 50];
export const DEFAULT_PAGE_SIZE = 10;

export default function PageSizeSelect({ value, onChange }) {
    return (
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
            Show
            <select
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full pl-3 pr-7 py-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#0f4a29] appearance-none cursor-pointer"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%236b7280' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.6rem center",
                }}
            >
                {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                        {n}
                    </option>
                ))}
            </select>
            per page
        </label>
    );
}