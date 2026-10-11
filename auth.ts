import NextAuth from "next-auth"
import { FirestoreAdapter } from "@auth/firebase-adapter"
import { adminDb } from "./lib/firebase-admin"
import { authConfig } from "./auth.config"
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

      // Master admin accounts & company domain automatically allowed
      if (
        email === 'mike@kidsdds.com' ||
        email === 'mike@miketheithandyman.com' ||
        email.endsWith('@kidsdds.com')
      ) {
        return true;
      }

      // Check if user has been pre-authorized in Firestore users collection
      if (adminDb && adminDb.collection) {
        try {
          const userSnap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
          if (!userSnap.empty) {
            const data = userSnap.docs[0].data();
            if (data.status && data.status.toLowerCase() === 'suspended') {
              return '/access-denied';
            }
            return true;
          }
        } catch (e) {
          console.error("Error verifying authorized user in signIn:", e);
        }
      }

      // Block unauthorized accounts and direct to access-denied page
      return '/access-denied';
    },

    async jwt({ token, user }) {
      if (user?.email) {
        const email = user.email.toLowerCase().trim();
        let role = 'VIEWER';

        if (email === 'mike@kidsdds.com' || email === 'mike@miketheithandyman.com') {
          role = 'ADMIN';
        } else if (adminDb && adminDb.collection) {
          try {
            const userSnap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
            if (!userSnap.empty) {
              role = userSnap.docs[0].data().role || 'ANALYST';
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
        (session.user as any).role = token.role || 'VIEWER';
      }
      return session;
    }
  }
})
