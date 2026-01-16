import { Outlet } from 'react-router-dom';

/**
 * @deprecated This layout is no longer used - AppShell handles the layout now
 * Keeping for backwards compatibility, will be removed in future cleanup
 */
export function DashboardLayout() {
  return <Outlet />;
}
