import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/auth-tokens.ts';
import { getOrCreateFirebaseUser, getUserById } from '../db/repositories.ts';

export interface AuthContext {
  userId: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  businessId: number | null;
}

export interface AuthRequest extends Request {
  auth?: AuthContext;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Empty authentication token' });
    return;
  }

  try {
    if (token.startsWith('bp_v1.')) {
      const payload = verifySessionToken(token);
      if (!payload) {
        res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
        return;
      }
      const user = await getUserById(payload.sub);
      if (!user || user.uid !== payload.uid) {
        res.status(401).json({ error: 'Account not found. Please sign in again.' });
        return;
      }
      req.auth = {
        userId: user.id,
        uid: user.uid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        businessId: user.businessId ?? null,
      };
      next();
      return;
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || `${decoded.uid}@users.bizpocket.local`;
    const fullName = decoded.name || email.split('@')[0] || 'Business Owner';
    const user = await getOrCreateFirebaseUser(decoded.uid, email, fullName);

    req.auth = {
      userId: user.id,
      uid: user.uid,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      businessId: user.businessId ?? null,
    };
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Unauthorized: Invalid authentication token' });
  }
};

export const requireBusiness = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!req.auth.businessId) {
    res.status(403).json({
      error: 'Business profile setup is required before accessing business records.',
      code: 'BUSINESS_REQUIRED',
    });
    return;
  }
  next();
};
