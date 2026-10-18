import { ReactNode } from 'react';
import SystemAlertBanner from '@/components/dashboard/SystemAlertBanner';
import DashboardNavigation from '@/components/dashboard/DashboardNavigation';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardNavigation banner={<SystemAlertBanner />}>
      {children}
    </DashboardNavigation>
  );
}
