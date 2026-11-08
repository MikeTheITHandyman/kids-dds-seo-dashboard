import { adminDb } from '@/lib/firebase-admin';
import { auth } from '@/auth';
import UserManager, { DashboardUser } from '@/components/dashboard/UserManager';
import LLMBudgetSettings, { MasteredQuestionSummary } from '@/components/dashboard/LLMBudgetSettings';
import LLMQuestionAndRegionManager from '@/components/dashboard/LLMQuestionAndRegionManager';
import ClientManager from '@/components/dashboard/ClientManager';
import { getLLMBudgetConfig, loadQuestionStateMap } from '@/lib/ai-harness/settings';
import {
  DEFAULT_CLIENT_ID,
  getActiveClientConfig,
  getAllClients,
  isSuperAdminEmail,
} from '@/lib/clients';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const [session, activeClient, allClients] = await Promise.all([
    auth(),
    getActiveClientConfig(),
    getAllClients(),
  ]);

  const currentEmail = session?.user?.email?.toLowerCase().trim() || '';
  const currentRole = (session?.user as any)?.role || 'ANALYST';
  const isSuperAdmin = currentRole === 'SUPER_ADMIN' || isSuperAdminEmail(currentEmail);
  const isAdmin = isSuperAdmin || currentRole === 'ADMIN';

  let users: DashboardUser[] = [];

  if (adminDb && adminDb.collection) {
    try {
      const snap = await adminDb.collection('users').get();
      const mapped: DashboardUser[] = snap.docs.map((doc: any) => {
        const d = doc.data();
        const uEmail = (d.email || '').toLowerCase().trim();
        const resolvedRole = isSuperAdminEmail(uEmail)
          ? 'SUPER_ADMIN'
          : ((d.role || (uEmail.includes('admin') ? 'ADMIN' : 'ANALYST')) as
              | 'SUPER_ADMIN'
              | 'ADMIN'
              | 'ANALYST'
              | 'VIEWER');
        const clientIds: string[] =
          Array.isArray(d.clientIds) && d.clientIds.length > 0
            ? d.clientIds
            : [DEFAULT_CLIENT_ID];

        return {
          id: doc.id,
          name: d.name || d.displayName || d.email?.split('@')[0] || 'Team Member',
          email: d.email || '',
          role: resolvedRole,
          clientIds,
          status: d.status || 'Active',
          image: d.image || null,
          createdAt: d.createdAt
            ? d.createdAt.toDate
              ? d.createdAt.toDate().toISOString()
              : String(d.createdAt)
            : null,
        };
      });

      users = isSuperAdmin
        ? mapped
        : mapped.filter(
            u => u.role === 'SUPER_ADMIN' || (u.clientIds || []).includes(activeClient.id)
          );
    } catch (e) {
      console.error('Error fetching users for settings:', e);
    }
  }

  const [llmConfig, questionStateMap] = await Promise.all([
    getLLMBudgetConfig(activeClient.id),
    loadQuestionStateMap(activeClient.id),
  ]);

  const allTrackedQuestions = Object.values(questionStateMap);
  const masteredList: MasteredQuestionSummary[] = allTrackedQuestions
    .filter(q => q.mastered)
    .map(q => ({
      key: q.key,
      location: q.location,
      topicName: q.topicName,
      lastTestedDate: q.lastTestedDate,
    }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
          Settings, Clients &amp; Team Access
        </h1>
        <p className="text-sm sm:text-base text-slate-500">
          Manage client profiles, Google Analytics &amp; Search Console integrations, LLM target questions, regional rotation, and authorized team users
        </p>
      </div>

      {/* 1. Client Profile, GA4 / GSC Integrations & Multi-Client Creator */}
      <ClientManager
        activeClient={activeClient}
        allClients={allClients}
        isSuperAdmin={isSuperAdmin}
        isAdmin={isAdmin}
        serviceAccountEmail={process.env.FIREBASE_CLIENT_EMAIL || null}
      />

      {/* 2. AI Visibility Schedule, Credit Budget & Auto Follow-Up Toggle */}
      <LLMBudgetSettings
        initialConfig={llmConfig}
        totalTracked={allTrackedQuestions.length}
        masteredList={masteredList}
        isAdmin={isAdmin}
        clientId={activeClient.id}
        clientName={activeClient.name}
      />

      {/* 3. Custom Questions, Regional Rotation Queue & AI Question Recommender */}
      <LLMQuestionAndRegionManager
        client={activeClient}
        currentRegionIndex={llmConfig.currentRegionIndex ?? activeClient.currentRegionIndex ?? 0}
        regionalRotationEnabled={
          llmConfig.regionalRotationEnabled ?? activeClient.regionalRotationEnabled ?? true
        }
        isAdmin={isAdmin}
      />

      {/* 4. Team Access & Super Admin / Client Admin Role Manager */}
      <UserManager
        initialUsers={users}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        currentUserEmail={currentEmail}
        activeClientId={activeClient.id}
        activeClientName={activeClient.name}
        allClients={allClients}
      />
    </div>
  );
}
