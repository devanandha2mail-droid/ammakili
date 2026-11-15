const pino = require('pino');

function redactEmail(email) {
  if (!email || typeof email !== 'string') return email;
  const parts = email.split('@');
  if (parts.length !== 2) return '[REDACTED]';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 1 ? name[0] + '***' : name + '***';
  return `${maskedName}@${domain}`;
}

function redactPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return '******' + digits.slice(-4);
}

function redactName(name) {
  if (!name || typeof name !== 'string') return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function redactAddress(address) {
  if (!address || typeof address !== 'string') return address;
  return '[REDACTED_ADDRESS]';
}

const isProd = process.env.NODE_ENV === 'production';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label })
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'password',
      '*.password',
      'secret',
      '*.secret',
      'token',
      '*.token',
      'key',
      '*.key',
      'razorpay_signature',
      '*.razorpay_signature',
      'card',
      '*.card',
      'cvv',
      '*.cvv'
    ],
    censor: '[REDACTED]'
  }
});

module.exports = {
  logger: pinoLogger,
  redactEmail,
  redactPhone,
  redactName,
  redactAddress
};

