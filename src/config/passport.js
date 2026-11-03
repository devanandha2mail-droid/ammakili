const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Customer = require('../models/Customer');

const clientID = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret';
const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const customer = await Customer.findById(id);
    done(null, customer);
  } catch (err) {
    done(err, null);
  }
});

// Configure Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const emailObj = profile.emails && profile.emails[0];
        if (!emailObj || !emailObj.value) {
          return done(new Error('Google profile did not provide an email address.'));
        }

        // Only accept accounts whose email is verified by Google
        if (emailObj.verified === false) {
          return done(new Error('Your Google email is not verified. Please verify it with Google before signing in.'));
        }

        const email = emailObj.value.toLowerCase().trim();
        const googleId = profile.id;
        const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() || 'Customer';
        const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : '';

        // Check if customer exists by googleId or email
        let customer = await Customer.findOne({ $or: [{ googleId }, { email }] });

        if (customer) {
          customer.googleId = googleId;
          customer.emailVerified = true;
          customer.lastLoginAt = new Date();
          if (!customer.avatarUrl && avatarUrl) customer.avatarUrl = avatarUrl;
          await customer.save();
        } else {
          customer = await Customer.create({
            googleId,
            email,
            emailVerified: true,
            name,
            avatarUrl,
            lastLoginAt: new Date()
          });
        }

        return done(null, customer);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
