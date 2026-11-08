import NextAuth from "next-auth"
import { FirestoreAdapter } from "@auth/firebase-adapter"
import { adminDb } from "./lib/firebase-admin"
import { authConfig } from "./auth.config"
import { isSuperAdminEmail } from "./lib/clients"
import * as admin from 'firebase-admin'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  ...(admin.apps.length ? { adapter: FirestoreAdapter(adminDb) } : {}),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user?.email) return false;
      const email = user.email.toLowerCase().trim();

      // Master super-admin accounts & company domain automatically allowed
      if (
        isSuperAdminEmail(email) ||
        email.endsWith('@kidsdds.com')
      ) {
        return true;
      }

      // Check if user has been pre-authorized in Firestore users collection
      if (adminDb && adminDb.collection) {
        try {
          let matchedDoc: any = null;
          const userSnap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
          if (!userSnap.empty) {
            matchedDoc = userSnap.docs[0];
          } else {
            const allUsersSnap = await adminDb.collection('users').get();
            matchedDoc = allUsersSnap.docs.find(
              (doc: any) => (doc.data()?.email || '').toLowerCase().trim() === email
            );
          }

          if (matchedDoc) {
            const data = matchedDoc.data();
            if (data.status && data.status.toLowerCase() === 'suspended') {
              return '/access-denied';
            }
            if (user.image && !data.image) {
              await matchedDoc.ref.update({
                image: user.image,
                name: data.name || user.name || email.split('@')[0],
                updatedAt: new Date()
              }).catch(() => {});
            }
            return true;
          }
        } catch (e) {
          console.error("Error verifying authorized user in signIn:", e);
        }
      }

      return '/access-denied';
    },

    async jwt({ token, user }) {
      const rawEmail = user?.email || (token?.email as string | undefined);
      if (rawEmail) {
        const email = rawEmail.toLowerCase().trim();
        let role = (token.role as string) || 'VIEWER';

        if (isSuperAdminEmail(email)) {
          role = 'SUPER_ADMIN';
        } else if (user && adminDb && adminDb.collection) {
          try {
            const userSnap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
            if (!userSnap.empty) {
              role = userSnap.docs[0].data().role || 'ANALYST';
            } else {
              const allUsersSnap = await adminDb.collection('users').get();
              const matched = allUsersSnap.docs.find(
                (doc: any) => (doc.data()?.email || '').toLowerCase().trim() === email
              );
              if (matched) {
                role = matched.data().role || 'ANALYST';
              }
            }
          } catch (e) {
            console.error("Error looking up role in jwt:", e);
          }
        }
        token.role = role;
      }
      return token;
    },

    async session({ session, token }) {
      if (session?.user) {
        if (token?.sub) session.user.id = token.sub;
        const email = session.user.email?.toLowerCase().trim() || '';
        const resolvedRole = isSuperAdminEmail(email)
          ? 'SUPER_ADMIN'
          : (token.role || 'VIEWER');
        (session.user as any).role = resolvedRole;
      }
      return session;
    }
  }
})
