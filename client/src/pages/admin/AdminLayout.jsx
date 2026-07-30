// client/src/pages/admin/AdminLayout.jsx
// Just an Outlet — no tab strip. Navigation between Dashboard/Staff
// Accounts/Employee Directory lives entirely in the Sidebar's "admin-ADMIN"
// menu (see Sidebar.jsx); a duplicate tab strip up here just repeated the
// same three links a second time.
import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return <Outlet />;
}
