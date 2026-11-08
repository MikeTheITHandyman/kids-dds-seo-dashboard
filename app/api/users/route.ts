import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { auth } from '@/auth';
import { DEFAULT_CLIENT_ID, getActiveClientId, isSuperAdminEmail } from '@/lib/clients';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      authorized: false,
      isSuperAdmin: false,
      response: NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 }),
    };
  }
  const email = session.user.email.toLowerCase().trim();
  const role = (session.user as any).role;
  const isSuperAdmin = role === 'SUPER_ADMIN' || isSuperAdminEmail(email);
  const isAdmin = isSuperAdmin || role === 'ADMIN';

  if (!isAdmin) {
    return {
      authorized: false,
      isSuperAdmin: false,
      response: NextResponse.json(
        { error: 'Forbidden: Administrator role required to manage users' },
        { status: 403 }
      ),
    };
  }
  return { authorized: true, isSuperAdmin, session, email };
}

// GET all users (requires logged in user)
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 });
  }

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  const email = session.user.email?.toLowerCase().trim() || '';
  const isSuperAdmin = (session.user as any).role === 'SUPER_ADMIN' || isSuperAdminEmail(email);

  try {
    const { searchParams } = new URL(request.url);
    const clientId = await getActiveClientId(searchParams.get('clientId'));

    const snap = await adminDb.collection('users').get();
    const allUsers = snap.docs.map((doc: any) => {
      const d = doc.data();
      const uEmail = (d.email || '').toLowerCase().trim();
      const rawRole = isSuperAdminEmail(uEmail)
        ? 'SUPER_ADMIN'
        : d.role || 'ANALYST';
      const clientIds: string[] = Array.isArray(d.clientIds) && d.clientIds.length > 0
        ? d.clientIds
        : [DEFAULT_CLIENT_ID];

      return {
        id: doc.id,
        name: d.name || d.displayName || 'Team Member',
        email: d.email || '',
        role: rawRole,
        clientIds,
        status: d.status || 'Active',
        image: d.image || null,
        createdAt: d.createdAt
          ? d.createdAt.toDate
            ? d.createdAt.toDate().toISOString()
            : d.createdAt
          : null,
      };
    });

    const users = isSuperAdmin
      ? allUsers
      : allUsers.filter((u: any) => u.role === 'SUPER_ADMIN' || u.clientIds.includes(clientId));

    return NextResponse.json({ users, isSuperAdmin });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST create or invite new user (requires ADMIN or SUPER_ADMIN role)
export async function POST(request: Request) {
  const authCheck = await checkAdminAuth();
  if (!authCheck.authorized) return authCheck.response;

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email, name, role = 'ANALYST', clientIds } = body;
    const activeClientId = await getActiveClientId(body.clientId);

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || cleanEmail.split('@')[0]).trim();
    const validRoles = authCheck.isSuperAdmin
      ? ['SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER']
      : ['ADMIN', 'ANALYST', 'VIEWER'];
    const cleanRole = isSuperAdminEmail(cleanEmail)
      ? 'SUPER_ADMIN'
      : validRoles.includes(String(role).toUpperCase())
      ? String(role).toUpperCase()
      : 'ANALYST';

    const resolvedClientIds: string[] =
      Array.isArray(clientIds) && clientIds.length > 0 ? clientIds : [activeClientId];

    // Check if user with this email already exists
    const existingSnap = await adminDb
      .collection('users')
      .where('email', '==', cleanEmail)
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingData = existingDoc.data();
      const mergedClientIds = Array.from(
        new Set([...(existingData.clientIds || [DEFAULT_CLIENT_ID]), ...resolvedClientIds])
      );
      await existingDoc.ref.update({
        name: cleanName || existingData.name,
        role: cleanRole,
        clientIds: authCheck.isSuperAdmin && Array.isArray(clientIds) ? resolvedClientIds : mergedClientIds,
        updatedAt: new Date(),
      });
      return NextResponse.json({
        success: true,
        message: 'User updated successfully',
        user: {
          id: existingDoc.id,
          email: cleanEmail,
          name: cleanName,
          role: cleanRole,
          clientIds: authCheck.isSuperAdmin && Array.isArray(clientIds) ? resolvedClientIds : mergedClientIds,
          status: existingData.status || 'Active',
        },
      });
    }

    const newUserRef = await adminDb.collection('users').add({
      email: cleanEmail,
      name: cleanName,
      role: cleanRole,
      clientIds: resolvedClientIds,
      status: 'Active',
      image: null,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'User authorized successfully',
      user: {
        id: newUserRef.id,
        email: cleanEmail,
        name: cleanName,
        role: cleanRole,
        clientIds: resolvedClientIds,
        status: 'Active',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH update user role, clientIds, or status
export async function PATCH(request: Request) {
  const authCheck = await checkAdminAuth();
  if (!authCheck.authorized) return authCheck.response;

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { id, role, status, name, clientIds } = body;

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (role) {
      const validRoles = authCheck.isSuperAdmin
        ? ['SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER']
        : ['ADMIN', 'ANALYST', 'VIEWER'];
      if (validRoles.includes(String(role).toUpperCase())) {
        updates.role = String(role).toUpperCase();
      }
    }
    if (status) updates.status = status;
    if (name) updates.name = name.trim();
    if (Array.isArray(clientIds) && clientIds.length > 0) {
      updates.clientIds = clientIds;
    }

    await adminDb.collection('users').doc(id).update(updates);

    return NextResponse.json({ success: true, message: 'User updated' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE user
export async function DELETE(request: Request) {
  const authCheck = await checkAdminAuth();
  if (!authCheck.authorized) return authCheck.response;

  if (!adminDb || !adminDb.collection) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const countSnap = await adminDb.collection('users').get();
    if (countSnap.size <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the only remaining user account' },
        { status: 400 }
      );
    }

    const targetDoc = await adminDb.collection('users').doc(id).get();
    if (targetDoc.exists && isSuperAdminEmail(targetDoc.data()?.email)) {
      return NextResponse.json(
        { error: 'Cannot delete a protected Super Admin account' },
        { status: 400 }
      );
    }

    await adminDb.collection('users').doc(id).delete();

    return NextResponse.json({ success: true, message: 'User removed successfully' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
