import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
    console.warn("⚠️  FIREBASE ADMIN ENVIRONMENT VARIABLES ARE MISSING! ⚠️");
    console.warn("Please generate a Service Account in your Firebase Console and add it to your .env.local file.");
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } catch (error) {
      console.error('Firebase admin initialization error', error);
    }
  }
}

export const adminDb = admin.apps.length ? admin.firestore() : ({} as any);
export const adminAuth = admin.apps.length ? admin.auth() : ({} as any);
export default admin;
