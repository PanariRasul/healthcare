// client/src/pages/pharmacy/PharmacyBilling.jsx
//
// Thin route wrapper around PharmacyInvoiceModal so "Pharmacy Billing" can
// be a real sidebar link (OPD, IPD, Admin's Pharmacy group, and Pharmacy's
// own menu) instead of only a button buried inside the Pharmacy dashboard /
// medicine list pages. The modal does all the actual work (patient search
// or walk-in entry, medicine autocomplete, save/print); this just mounts it
// and sends the user back to whatever page they clicked the link from when
// they close it.
import { useNavigate } from "react-router-dom";
import PharmacyInvoiceModal from "../../components/PharmacyInvoiceModal";

export default function PharmacyBilling() {
  const navigate = useNavigate();
  return <PharmacyInvoiceModal onClose={() => navigate(-1)} />;
}
