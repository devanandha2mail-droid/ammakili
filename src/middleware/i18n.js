const fs = require('fs');
const path = require('path');

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../../locales/en.json'), 'utf8'));
const ml = JSON.parse(fs.readFileSync(path.join(__dirname, '../../locales/ml.json'), 'utf8'));

const translations = { en, ml };

function getNestedValue(obj, pathStr) {
  if (!obj || !pathStr) return pathStr;
  const parts = pathStr.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

const i18nMiddleware = (req, res, next) => {
  // Query param takes priority, then cookie, defaulting to en
  let lang = req.query.lang || req.cookies?.nest_lang || 'en';
  if (lang !== 'en' && lang !== 'ml') {
    lang = 'en';
  }

  // If query param set, set cookie
  if (req.query.lang && (req.query.lang === 'en' || req.query.lang === 'ml')) {
    res.cookie('nest_lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  }

  res.locals.lang = lang;

  // Translation function
  res.locals.t = (key, params = {}) => {
    let text = getNestedValue(translations[lang], key);
    if (!text && lang !== 'en') {
      text = getNestedValue(translations.en, key);
    }
    if (!text) {
      return key;
    }

    // Replace {var} with params
    Object.keys(params).forEach(k => {
      text = text.replace(new RegExp(`{${k}}`, 'g'), params[k]);
    });

    return text;
  };

  // Helper to pick localized field from mongoose doc or object { en, ml }
  res.locals.getLocalized = (field) => {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (lang === 'ml' && field.ml && field.ml.trim() !== '') {
      return field.ml;
    }
    return field.en || '';
  };

  next();
};

module.exports = i18nMiddleware;
