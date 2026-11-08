import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  ACTIVE_CLIENT_COOKIE,
  ClientConfig,
  DEFAULT_CLIENT_ID,
  getActiveClientId,
  getAllClients,
  getClientConfig,
  isSuperAdminEmail,
  normalizeClientConfig,
  saveClientConfig,
} from '@/lib/clients';

export const dynamic = 'force-dynamic';

async function getSessionPermissions() {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      authenticated: false,
      email: '',
      role: 'VIEWER',
      isSuperAdmin: false,
      isAdmin: false,
      allowedClientIds: [] as string[],
    };
  }

  const email = session.user.email.toLowerCase().trim();
  const role = ((session.user as any).role || 'ANALYST') as string;
  const isSuperAdmin = isSuperAdminEmail(email) || role === 'SUPER_ADMIN';
  const isAdmin = isSuperAdmin || role === 'ADMIN';

  let allowedClientIds: string[] = [];
  if (!isSuperAdmin && adminDb && adminDb.collection) {
    try {
      const snap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        if (Array.isArray(d.clientIds) && d.clientIds.length > 0) {
          allowedClientIds = d.clientIds;
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    authenticated: true,
    email,
    role: isSuperAdmin ? 'SUPER_ADMIN' : role,
    isSuperAdmin,
    isAdmin,
    allowedClientIds,
  };
}

export async function GET() {
  const perms = await getSessionPermissions();
  if (!perms.authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allClients = await getAllClients();
  const visibleClients = perms.isSuperAdmin || perms.allowedClientIds.length === 0
    ? allClients
    : allClients.filter(c => perms.allowedClientIds.includes(c.id));

  const activeClientId = await getActiveClientId();
  const activeClient =
    visibleClients.find(c => c.id === activeClientId) ||
    visibleClients[0] ||
    allClients[0];

  return NextResponse.json({
    clients: visibleClients,
    activeClientId: activeClient.id,
    activeClient,
    isSuperAdmin: perms.isSuperAdmin,
    isAdmin: perms.isAdmin,
    serviceAccountEmail: process.env.FIREBASE_CLIENT_EMAIL || null,
  });
}

// POST: Create a new client (Super Admin only) OR switch active client
export async function POST(request: Request) {
  const perms = await getSessionPermissions();
  if (!perms.authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Action 1: Switch active client cookie
    if (body.action === 'switch' && body.clientId) {
      const targetId = String(body.clientId).trim();
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_CLIENT_COOKIE, targetId, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
      const client = await getClientConfig(targetId);
      return NextResponse.json({ success: true, activeClientId: targetId, client });
    }

    // Action 2: Create a new client (requires SUPER_ADMIN)
    if (!perms.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin privileges required to create a new client' },
        { status: 403 }
      );
    }

    const rawName = String(body.name || '').trim();
    if (!rawName) {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
    }

    const rawId =
      String(body.id || rawName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `client-${Date.now()}`;

    const newClient = normalizeClientConfig(
      {
        ...body,
        id: rawId,
        name: rawName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      rawId
    );

    if (adminDb && adminDb.collection) {
      await adminDb.collection('clients').doc(rawId).set(newClient, { merge: true });
    }

    // Switch active client to the newly created client if requested
    if (body.switchToNew !== false) {
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_CLIENT_COOKIE, rawId, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }

    return NextResponse.json({
      success: true,
      client: newClient,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save client' }, { status: 500 });
  }
}

// PATCH: Update an existing client's configuration, questions, regions, or GA4 lead events
export async function PATCH(request: Request) {
  const perms = await getSessionPermissions();
  if (!perms.authenticated || !perms.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden: Administrator role required to modify client configuration' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const targetId = await getActiveClientId(body.id || body.clientId);

    if (
      !perms.isSuperAdmin &&
      perms.allowedClientIds.length > 0 &&
      !perms.allowedClientIds.includes(targetId)
    ) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have admin access to this client' },
        { status: 403 }
      );
    }

    const updated = await saveClientConfig(targetId, body);
    return NextResponse.json({
      success: true,
      client: updated,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to update client settings' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a client (Super Admin only, cannot delete default kids-dentist)
export async function DELETE(request: Request) {
  const perms = await getSessionPermissions();
  if (!perms.authenticated || !perms.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Forbidden: Super Admin privileges required to delete a client' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || id === DEFAULT_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Cannot delete the default Kids Dentist client' },
        { status: 400 }
      );
    }

    if (adminDb && adminDb.collection) {
      await adminDb.collection('clients').doc(id).delete();
    }

    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_CLIENT_COOKIE)?.value === id) {
      cookieStore.set(ACTIVE_CLIENT_COOKIE, DEFAULT_CLIENT_ID, { path: '/' });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to delete client' }, { status: 500 });
  }
}
