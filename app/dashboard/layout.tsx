import { ReactNode } from 'react';
import SystemAlertBanner from '@/components/dashboard/SystemAlertBanner';
import DashboardNavigation from '@/components/dashboard/DashboardNavigation';
import { auth } from '@/auth';
import { getActiveClientConfig, getAllClients, isSuperAdminEmail } from '@/lib/clients';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase().trim() || '';
  const role = (session?.user as any)?.role || 'ANALYST';
  const isSuperAdmin = role === 'SUPER_ADMIN' || isSuperAdminEmail(email);

  const [allClients, activeClient] = await Promise.all([
    getAllClients(),
    getActiveClientConfig(),
  ]);

  let visibleClients = allClients;
  if (!isSuperAdmin && email && adminDb && adminDb.collection) {
    try {
      const snap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
      if (!snap.empty) {
        const clientIds: string[] = snap.docs[0].data()?.clientIds || [];
        if (clientIds.length > 0) {
          visibleClients = allClients.filter(c => clientIds.includes(c.id));
        }
      }
    } catch {
      // ignore
    }
  }

  return (
    <DashboardNavigation
      banner={<SystemAlertBanner />}
      activeClient={activeClient}
      clients={visibleClients}
      isSuperAdmin={isSuperAdmin}
    >
      {children}
    </DashboardNavigation>
  );
}
