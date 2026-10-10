import NextAuth from "next-auth"
import { FirestoreAdapter } from "@auth/firebase-adapter"
import { adminDb } from "./lib/firebase-admin"
import { authConfig } from "./auth.config"
import * as admin from 'firebase-admin'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  ...(admin.apps.length ? { adapter: FirestoreAdapter(adminDb) } : {}),
  session: { strategy: "jwt" },
})
