// client/src/App.jsx
// all routes
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import {
  opdPatients as initOPD,
  ipdPatients as initIPD,
} from "./data/dummyData";

import Login from "./pages/login/Login";
import Layout from "./components/Layout";
import ProtectedRoute from "./routes/ProtectedRoute";

import OPDDashboard from "./pages/opd/OPDDashboard";
import OPDPatientList from "./pages/opd/OPDPatientList";
import OPDPatientForm from "./pages/opd/OPDPatientForm";
import OPDFollowUps from "./pages/opd/OPDFollowUps";

import IPDDashboard from "./pages/ipd/IPDDashboard";
import IPDPatientList from "./pages/ipd/IPDPatientList";
import IPDPatientForm from "./pages/ipd/IPDPatientForm";
import IPDPaymentList from "./pages/ipd/payments/IPDPaymentList";
import IPDFollowups from "./pages/ipd/IPDFollowUps";
import IPDDischargedList from "./pages/ipd/IPDDischargeList";

import DoctorOPDLayout from "./pages/doctor/DoctorOPDLayout";
import { DoctorOPDDashboard } from "./pages/doctor/DoctorOPDDashboard";
import { DoctorOPDRevenue } from "./pages/doctor/DoctorOPDRevenue";
import { DoctorIPDDashboard } from "./pages/doctor/DoctorIPDDashboard";
import { IPDDoctorDashboard } from "./pages/doctor/IPDDoctorDashboard";

import Profile from "./pages/profile/Profile";

import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminStaffAccounts from "./pages/admin/AdminStaffAccounts";
import AdminEmployeeDirectory from "./pages/admin/AdminEmployeeDirectory";
import AdminProfile from "./pages/admin/AdminProfile";
import AdminPharmacyAnalytics from "./pages/admin/AdminPharmacyAnalytics";
import AdminPatientAnalytics from "./pages/admin/AdminPatientAnalytics"; // NEW
import BiometricManagement from "./pages/admin/biometric/BiometricManagement";
import BiometricStaffEmployee from "./pages/admin/biometric/BiometricStaffEmployee";

import PharmacyDashboard from "./pages/pharmacy/PharmacyDashboard";
import PharmacyMedicineList from "./pages/pharmacy/PharmacyMedicineList";
import PharmacyMedicineForm from "./pages/pharmacy/PharmacyMedicineForm";
import PharmacyStockHistory from "./pages/pharmacy/PharmacyStockHistory";
import PharmacyExpiryAlerts from "./pages/pharmacy/PharmacyExpiryAlerts";
import PharmacyBilling from "./pages/pharmacy/PharmacyBilling";
import { Import } from "lucide-react";
import AdminSalaryManagement from "./pages/admin/AdminSalaryManagement";
import AdminWorkingDays from "./pages/admin/AdminWorkingDays";
import AdminEmployeeShiftAssignment from "./pages/admin/AdminEmpShiftAssignment";
import ManagerDashboard from "./pages/manager/ManagerDashboard";

function AppRoutes() {
  const { user, initializing } = useAuth();
  const [opdPatients, setOpdPatients] = useState(initOPD);
  const [ipdPatients, setIpdPatients] = useState(initIPD);

  // While we're verifying a stored token against the backend on first load,
  // hold off rendering routes — otherwise a valid session flashes a redirect
  // to /login before the check resolves.
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8z"
            />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Receptionist OPD */}
      <Route
        element={
          <ProtectedRoute role="receptionist" module="OPD">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/opd-dashboard" element={<OPDDashboard />} />
        <Route path="/opd/register" element={<OPDPatientForm />} />
        <Route path="/opd/patients/:id/edit" element={<OPDPatientForm />} />
        <Route path="/opd/patients" element={<OPDPatientList />} />
        <Route path="/opd/followups" element={<OPDFollowUps />} />
        <Route path="/opd/pharmacy-billing" element={<PharmacyBilling />} />
      </Route>

      {/* Receptionist IPD */}
      <Route
        element={
          <ProtectedRoute role="receptionist" module="IPD">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/ipd-dashboard" element={<IPDDashboard />} />
        <Route
          path="/ipd/admit"
          element={
            <IPDPatientForm
              patients={ipdPatients}
              setPatients={setIpdPatients}
            />
          }
        />
        <Route
          path="/ipd/patients"
          element={
            <IPDPatientList
              patients={ipdPatients}
              setPatients={setIpdPatients}
            />
          }
        />
        <Route path="/ipd/payments" element={<IPDPaymentList />} />
        <Route path="/ipd/discharged" element={<IPDDischargedList />} />
        <Route path="/ipd/followups" element={<IPDFollowups />} />
        <Route path="/ipd/pharmacy-billing" element={<PharmacyBilling />} />
      </Route>

      {/* Doctor OPD — /doctor/opd itself just redirects to the dashboard;
          dashboard/patients/followups are real sibling routes sharing
          DoctorOPDLayout (banner + tab nav), so the URL always matches
          what's on screen and the sidebar highlights the right tab. */}
      <Route
        element={
          <ProtectedRoute role="doctor" module="OPD">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route element={<DoctorOPDLayout />}>
          <Route
            path="/doctor/opd"
            element={<Navigate to="/doctor/opd/dashboard" replace />}
          />
          <Route
            path="/doctor/opd/dashboard"
            element={<DoctorOPDDashboard />}
          />
          <Route path="/doctor/opd/register" element={<OPDPatientForm />} />
          <Route
            path="/doctor/opd/patients/:id/edit"
            element={<OPDPatientForm />}
          />
          <Route
            path="/doctor/opd/patients"
            element={<OPDPatientList isDoctor />}
          />
          <Route
            path="/doctor/opd/followups"
            element={<OPDFollowUps patients={opdPatients} />}
          />
          <Route path="/doctor/opd/revenue" element={<DoctorOPDRevenue />} />
        </Route>
        <Route
          path="/doctor/opd/pharmacy-billing"
          element={<PharmacyBilling />}
        />
      </Route>

      {/* Doctor IPD */}
      <Route
        element={
          <ProtectedRoute role="doctor" module="IPD">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/doctor/ipd/dashboard"
          element={<IPDDoctorDashboard patients={ipdPatients} />}
        />
        <Route
          path="/doctor/ipd"
          element={<DoctorIPDDashboard patients={ipdPatients} />}
        />
        <Route path="/doctor/ipd/followups" element={<IPDFollowups />} />
        <Route
          path="/doctor/ipd/pharmacy-billing"
          element={<PharmacyBilling />}
        />
      </Route>

      {/* Admin Pages & profile */}
      <Route
        element={
          <ProtectedRoute role="admin">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route element={<AdminLayout />}>
          <Route
            path="/admin"
            element={<Navigate to="/admin/dashboard" replace />}
          />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/staff" element={<AdminStaffAccounts />} />
          <Route path="/admin/employees" element={<AdminEmployeeDirectory />} />
          <Route path="/admin/pharmacy" element={<AdminPharmacyAnalytics />} />
          <Route path="/admin/patients" element={<AdminPatientAnalytics />} />
          <Route path="/admin/biometric" element={<BiometricManagement />} />
          <Route
            path="/admin/biometric/manage"
            element={<BiometricStaffEmployee />}
          />
          <Route
            path="/admin/salary-management"
            element={<AdminSalaryManagement />}
          />
          <Route path="/admin/workingdays" element={<AdminWorkingDays />} />
          <Route
            path="/admin/shift-assign"
            element={<AdminEmployeeShiftAssignment />}
          />
        </Route>
        {/* Own dedicated path/component (AdminProfile.jsx), not the shared
            /profile below — avoids re-creating the duplicate-path bug and
            matches the naming convention of the other Admin pages. */}
        <Route path="/admin/profile" element={<AdminProfile />} />

        {/* Admin access to the Pharmacy module. Same page components the
            Pharmacy role uses, mounted under /admin/pharmacy-* paths so
            they don't collide with the /pharmacy/* routes below (which are
            gated by role="pharmacy"). This keeps ProtectedRoute untouched —
            admin already gets in via role="admin" on this block. */}
        <Route
          path="/admin/pharmacy-dashboard"
          element={<PharmacyDashboard />}
        />
        <Route path="/admin/pharmacy/add" element={<PharmacyMedicineForm />} />
        <Route
          path="/admin/pharmacy/medicines/:id/edit"
          element={<PharmacyMedicineForm />}
        />
        <Route
          path="/admin/pharmacy/medicines"
          element={<PharmacyMedicineList />}
        />
        <Route
          path="/admin/pharmacy/stock"
          element={<PharmacyStockHistory />}
        />
        <Route
          path="/admin/pharmacy/expiry"
          element={<PharmacyExpiryAlerts />}
        />
        <Route path="/admin/pharmacy/billing" element={<PharmacyBilling />} />
      </Route>

      {/* Manager — reuses the same Employee Directory, Biometric
          Management, and Shift Assignment pages Admin uses, just under
          /manager/* routes so Manager's own ProtectedRoute/sidebar apply.
          Manager now has full access to Employee Directory, Biometric
          Management (including Shift Management inside its "Shifts" tab),
          and Shift Assignment — matching the backend route permissions in
          admin.routes.js and biometric.routes.js. */}
      <Route
        element={
          <ProtectedRoute role="manager">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/manager"
          element={<Navigate to="/manager/dashboard" replace />}
        />
        <Route path="/manager/dashboard" element={<ManagerDashboard />} />
        <Route path="/manager/employees" element={<AdminEmployeeDirectory />} />
        <Route path="/manager/biometric" element={<BiometricManagement />} />
        <Route
          path="/manager/biometric/manage"
          element={<BiometricStaffEmployee />}
        />
        <Route
          path="/manager/shift-assign"
          element={<AdminEmployeeShiftAssignment />}
        />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* Pharmacy */}
      <Route
        element={
          <ProtectedRoute role="pharmacy" module="Pharmacy">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/pharmacy-dashboard" element={<PharmacyDashboard />} />
        <Route path="/pharmacy/add" element={<PharmacyMedicineForm />} />
        <Route
          path="/pharmacy/medicines/:id/edit"
          element={<PharmacyMedicineForm />}
        />
        <Route path="/pharmacy/medicines" element={<PharmacyMedicineList />} />
        <Route path="/pharmacy/stock" element={<PharmacyStockHistory />} />
        <Route path="/pharmacy/expiry" element={<PharmacyExpiryAlerts />} />
        <Route path="/pharmacy/billing" element={<PharmacyBilling />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
