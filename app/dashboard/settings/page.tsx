import { adminDb } from '@/lib/firebase-admin';
import { auth } from '@/auth';
import UserManager, { DashboardUser } from '@/components/dashboard/UserManager';
import LLMBudgetSettings, { MasteredQuestionSummary } from '@/components/dashboard/LLMBudgetSettings';
import { getLLMBudgetConfig, loadQuestionStateMap } from '@/lib/ai-harness/settings';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const session = await auth();
  const currentEmail = session?.user?.email?.toLowerCase().trim() || '';
  const currentRole = (session?.user as any)?.role || 'ANALYST';
  const isAdmin = currentRole === 'ADMIN' || currentEmail === 'mike@kidsdds.com' || currentEmail === 'mike@miketheithandyman.com';

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
          role: (d.role || (d.email?.includes('admin') || d.email === 'mike@kidsdds.com' || d.email === 'mike@miketheithandyman.com' ? 'ADMIN' : 'ANALYST')) as 'ADMIN' | 'ANALYST' | 'VIEWER',
          status: d.status || 'Active',
          image: d.image || null,
          createdAt: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : String(d.createdAt)) : null
        };
      });
    } catch (e) {
      console.error("Error fetching users for settings:", e);
    }
  }

  const [llmConfig, questionStateMap] = await Promise.all([
    getLLMBudgetConfig(),
    loadQuestionStateMap()
  ]);

  const allTrackedQuestions = Object.values(questionStateMap);
  const masteredList: MasteredQuestionSummary[] = allTrackedQuestions
    .filter(q => q.mastered)
    .map(q => ({
      key: q.key,
      location: q.location,
      topicName: q.topicName,
      lastTestedDate: q.lastTestedDate
    }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Settings & Team Access</h1>
        <p className="text-sm sm:text-base text-slate-500">
          Configure AI Visibility credit budget, query frequency, and authorized team access
        </p>
      </div>

      <LLMBudgetSettings
        initialConfig={llmConfig}
        totalTracked={allTrackedQuestions.length}
        masteredList={masteredList}
        isAdmin={isAdmin}
      />

      <UserManager 
        initialUsers={users} 
        isAdmin={isAdmin} 
        currentUserEmail={currentEmail} 
      />
    </div>
  );
}
