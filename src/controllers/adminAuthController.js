const crypto = require('crypto');
const AdminUser = require('../models/AdminUser');
const { logAdminAction } = require('../services/auditLogger');

/**
 * Admin Authentication Controller
 * Uses Google OAuth 2.0 with strict allowlist verification.
 * Zero password authentication.
 */

// Helper to construct callback URL
function getCallbackUrl(req) {
  if (process.env.GOOGLE_ADMIN_CALLBACK_URL) {
    return process.env.GOOGLE_ADMIN_CALLBACK_URL;
  }
  const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  return `${siteUrl}/admin/auth/google/callback`;
}

// 1. GET /admin/login
exports.getLogin = (req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin');
  }

  const { error, reason } = req.query;
  let reasonMsg = null;
  if (reason === 'idle_timeout') {
    reasonMsg = 'You were signed out due to 30 minutes of inactivity.';
  } else if (reason === 'session_expired') {
    reasonMsg = 'Your session reached the 8-hour limit. Please sign in again.';
  } else if (reason === 'deactivated') {
    reasonMsg = 'Your admin account has been deactivated.';
  } else if (reason === 'session_revoked') {
    reasonMsg = 'You were signed out from all active sessions.';
  }

  res.render('admin/login', {
    layout: false,
    title: 'Admin Console – Nest by Ammakkili',
    error: error ? 'Not authorised. Your Google account is not permitted to access this area.' : null,
    reason: reasonMsg
  });
};

// 2. GET /admin/auth/google
exports.startGoogleAuth = (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  const nonce = crypto.randomBytes(32).toString('hex');

  req.session.adminOAuthState = state;
  req.session.adminOAuthNonce = nonce;

  if (req.query.returnTo && req.query.returnTo.startsWith('/admin')) {
    req.session.adminReturnTo = req.query.returnTo;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
  const callbackUrl = getCallbackUrl(req);
  const promptParam = req.query.prompt === 'select_account' ? '&prompt=select_account' : '';

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('openid email profile')}&` +
    `state=${state}&` +
    `nonce=${nonce}${promptParam}`;

  res.redirect(authUrl);
};

// 3. GET /admin/auth/google/callback
exports.handleGoogleCallback = async (req, res, next) => {
  const { code, state, error } = req.query;
  const expectedState = req.session ? req.session.adminOAuthState : null;

  // Clear state immediately to prevent replay
  if (req.session) {
    req.session.adminOAuthState = null;
  }

  // 1. Verify state parameter
  if (!state || !expectedState || state !== expectedState || error || !code) {
    await logAdminAction({
      req,
      action: 'ADMIN_OAUTH_STATE_INVALID',
      details: { queryState: state, error: error || 'Missing code or mismatched state' }
    });
    return res.status(403).render('admin/unauthorized', { layout: false, title: 'Not Authorised' });
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret';
    const callbackUrl = getCallbackUrl(req);
    const tokenEndpoint = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';

    // 2. Exchange authorization code for tokens
    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      await logAdminAction({
        req,
        action: 'ADMIN_OAUTH_TOKEN_EXCHANGE_FAILED',
        details: { status: tokenRes.status, err: errText.slice(0, 200) }
      });
      return res.status(403).render('admin/unauthorized', { layout: false, title: 'Not Authorised' });
    }

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;
    const accessToken = tokenData.access_token;

    // Decode ID Token payload
    let email = null;
    let emailVerified = false;
    let sub = null;
    let authTime = Date.now();

    if (idToken) {
      try {
        const parts = idToken.split('.');
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        email = payload.email;
        emailVerified = payload.email_verified === true || payload.email_verified === 'true';
        sub = payload.sub;
        if (payload.auth_time) authTime = payload.auth_time * 1000;
        else if (payload.iat) authTime = payload.iat * 1000;
      } catch (jwtErr) {
        // Fallback to userinfo
      }
    }

    if (!email || !sub) {
      // Call Google userinfo endpoint if id_token decoding didn't yield full info
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (userInfoRes.ok) {
        const profile = await userInfoRes.json();
        email = profile.email;
        emailVerified = profile.email_verified === true || profile.email_verified === 'true';
        sub = profile.sub;
      }
    }

    // 3. Strict rule: email_verified must be true
    if (!emailVerified || !email || !sub) {
      await logAdminAction({
        req,
        action: 'ADMIN_LOGIN_UNVERIFIED_EMAIL',
        target: email || 'unknown',
        details: { emailVerified }
      });
      return res.status(403).render('admin/unauthorized', { layout: false, title: 'Not Authorised' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 4. Query AdminUser allowlist
    const adminUser = await AdminUser.findOne({ email: normalizedEmail });

    // Reject if not on allowlist or inactive (generic Not Authorised message)
    if (!adminUser || !adminUser.active) {
      await logAdminAction({
        req,
        action: 'ADMIN_LOGIN_REFUSED',
        target: normalizedEmail,
        details: { reason: !adminUser ? 'not_on_allowlist' : 'account_inactive' }
      });
      return res.status(403).render('admin/unauthorized', { layout: false, title: 'Not Authorised' });
    }

    // 5. Google sub binding & verification
    if (!adminUser.googleSub) {
      // First successful login: bind Google sub
      adminUser.googleSub = sub;
      adminUser.lastLoginAt = new Date();
      await adminUser.save();
      await logAdminAction({
        req,
        action: 'ADMIN_SUB_BOUND',
        target: normalizedEmail,
        details: { sub }
      });
    } else if (adminUser.googleSub !== sub) {
      // Re-authentication with different Google account than originally bound
      await logAdminAction({
        req,
        action: 'ADMIN_SUB_MISMATCH',
        target: normalizedEmail,
        details: { expectedSub: adminUser.googleSub, providedSub: sub }
      });
      return res.status(403).render('admin/unauthorized', { layout: false, title: 'Not Authorised' });
    } else {
      adminUser.lastLoginAt = new Date();
      await adminUser.save();
    }

    // 6. Regenerate session ID and establish authenticated admin session
    req.session.regenerate(async (err) => {
      if (err) return next(err);

      const now = Date.now();
      req.session.adminId = adminUser._id;
      req.session.adminEmail = adminUser.email;
      req.session.adminRole = adminUser.role;
      req.session.adminAuthTime = now;
      req.session.adminSessionCreatedAt = now;
      req.session.adminLastActiveAt = now;

      await logAdminAction({
        req,
        action: 'ADMIN_LOGIN_SUCCESS',
        target: adminUser.email,
        details: { role: adminUser.role }
      });

      const returnTo = req.session.adminReturnTo || '/admin';
      delete req.session.adminReturnTo;
      res.redirect(returnTo.startsWith('/admin') ? returnTo : '/admin');
    });

  } catch (err) {
    console.error('Admin OAuth callback error:', err);
    res.status(403).render('admin/unauthorized', { layout: false, title: 'Not Authorised' });
  }
};

// 4. GET /admin/logout
exports.logout = async (req, res) => {
  await logAdminAction({ req, action: 'ADMIN_LOGOUT' });
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};

// 5. POST /admin/sign-out-everywhere
exports.signOutEverywhere = async (req, res) => {
  try {
    if (req.session && req.session.adminId) {
      await AdminUser.findByIdAndUpdate(req.session.adminId, {
        sessionValidAfter: new Date()
      });
      await logAdminAction({ req, action: 'ADMIN_SIGN_OUT_EVERYWHERE' });
    }
  } catch (err) {
    console.error('Error signing out everywhere:', err);
  }

  req.session.destroy(() => {
    res.redirect('/admin/login?reason=session_revoked');
  });
};
