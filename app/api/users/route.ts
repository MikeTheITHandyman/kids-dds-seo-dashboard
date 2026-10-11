import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const session = await auth();
  if (!session?.user?.email) {
    return { 
      authorized: false, 
      response: NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 }) 
    };
  }
  const email = session.user.email.toLowerCase().trim();
  const role = (session.user as any).role;
  const isAdmin = role === 'ADMIN' || email === 'mike@kidsdds.com' || email === 'mike@miketheithandyman.com';
  
  if (!isAdmin) {
    return { 
      authorized: false, 
      response: NextResponse.json({ error: "Forbidden: Administrator role required to manage users" }, { status: 403 }) 
    };
  }
  return { authorized: true, session };
}

// GET all users (requires logged in user)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 });
  }

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  try {
    const snap = await adminDb.collection('users').get();
    const users = snap.docs.map((doc: any) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || d.displayName || 'Team Member',
        email: d.email || '',
        role: d.role || 'ANALYST',
        status: d.status || 'Active',
        image: d.image || null,
        createdAt: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : d.createdAt) : null
      };
    });

    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST create or invite new user (requires ADMIN role)
export async function POST(request: Request) {
  const authCheck = await checkAdminAuth();
  if (!authCheck.authorized) return authCheck.response;

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email, name, role = 'ANALYST' } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || cleanEmail.split('@')[0]).trim();
    const validRoles = ['ADMIN', 'ANALYST', 'VIEWER'];
    const cleanRole = validRoles.includes(role.toUpperCase()) ? role.toUpperCase() : 'ANALYST';

    // Check if user with this email already exists
    const existingSnap = await adminDb.collection('users').where('email', '==', cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      // Update their role and name
      const existingDoc = existingSnap.docs[0];
      await existingDoc.ref.update({
        name: cleanName || existingDoc.data().name,
        role: cleanRole,
        updatedAt: new Date()
      });
      return NextResponse.json({ 
        success: true, 
        message: "User role updated successfully",
        user: { id: existingDoc.id, email: cleanEmail, name: cleanName, role: cleanRole, status: existingDoc.data().status || 'Active' }
      });
    }

    // Create new authorized user record in Firestore
    const newUserRef = await adminDb.collection('users').add({
      email: cleanEmail,
      name: cleanName,
      role: cleanRole,
      status: 'Active',
      image: null,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      message: "User authorized successfully",
      user: {
        id: newUserRef.id,
        email: cleanEmail,
        name: cleanName,
        role: cleanRole,
        status: 'Active',
        createdAt: new Date().toISOString()
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH update user role or status (requires ADMIN role)
export async function PATCH(request: Request) {
  const authCheck = await checkAdminAuth();
  if (!authCheck.authorized) return authCheck.response;

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { id, role, status, name } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (role) {
      const validRoles = ['ADMIN', 'ANALYST', 'VIEWER'];
      if (validRoles.includes(role.toUpperCase())) {
        updates.role = role.toUpperCase();
      }
    }
    if (status) updates.status = status;
    if (name) updates.name = name.trim();

    await adminDb.collection('users').doc(id).update(updates);

    return NextResponse.json({ success: true, message: "User updated" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE user (requires ADMIN role)
export async function DELETE(request: Request) {
  const authCheck = await checkAdminAuth();
  if (!authCheck.authorized) return authCheck.response;

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Safety check: ensure we don't delete if only 1 user exists
    const countSnap = await adminDb.collection('users').get();
    if (countSnap.size <= 1) {
      return NextResponse.json({ error: "Cannot delete the only remaining user account" }, { status: 400 });
    }

    await adminDb.collection('users').doc(id).delete();

    return NextResponse.json({ success: true, message: "User removed successfully" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
