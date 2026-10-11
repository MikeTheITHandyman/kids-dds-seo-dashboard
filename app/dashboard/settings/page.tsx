import { adminDb } from '@/lib/firebase-admin';
import UserManager, { DashboardUser } from '@/components/dashboard/UserManager';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  let users: DashboardUser[] = [];

  if (adminDb && adminDb.collection) {
    try {
      const snap = await adminDb.collection('users').get();
      users = snap.docs.map((doc: any) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name || d.displayName || d.email?.split('@')[0] || 'Team Member',
          email: d.email || '',
          role: (d.role || (d.email?.includes('admin') || d.email === 'mike@kidsdds.com' ? 'ADMIN' : 'ANALYST')) as 'ADMIN' | 'ANALYST' | 'VIEWER',
          status: d.status || 'Active',
          image: d.image || null,
          createdAt: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : String(d.createdAt)) : null
        };
      });
    } catch (e) {
      console.error("Error fetching users for settings:", e);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings & Team Access</h1>
        <p className="text-slate-500">Manage authorized users, assign roles, and configure dashboard access</p>
      </div>

      <UserManager initialUsers={users} />
    </div>
  );
}
