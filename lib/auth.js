import admin from 'firebase-admin';

// Initialize Firebase Admin SDK singleton
function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
    } else if (projectId) {
      admin.initializeApp({
        projectId
      });
    }
  }
  return admin;
}

/**
 * Verifies Authorization Bearer Token from HTTP request headers.
 * 
 * @param {Request} request - Next.js App Router Request object
 * @returns {Promise<Object>} Decoded user token payload
 * @throws {Error} If token is missing, invalid, or expired
 */
export async function authenticateRequest(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Authentication required: Missing or malformed Bearer token');
    error.statusCode = 401;
    throw error;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    const error = new Error('Authentication required: Empty Bearer token');
    error.statusCode = 401;
    throw error;
  }

  // Development & Test Mode token support
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_TOKENS === 'true') {
    if (token === 'test-valid-firebase-token' || token === 'mock-admin-token') {
      return {
        uid: 'test-user-123',
        email: 'test@vitto.money',
        name: 'Test Reviewer'
      };
    }
  }

  try {
    const firebaseAdmin = getFirebaseAdmin();
    if (!firebaseAdmin.apps.length) {
      // Fallback for demo/unconfigured admin environment in local dev
      if (process.env.NODE_ENV !== 'production' && token.startsWith('demo-token-')) {
        return {
          uid: 'demo-user',
          email: 'demo@vitto.money'
        };
      }
      throw new Error('Firebase Admin SDK is not configured with credentials');
    }

    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (err) {
    const error = new Error(`Authentication failed: ${err.message}`);
    error.statusCode = 401;
    throw error;
  }
}
