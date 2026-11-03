require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Product = require('../src/models/Product');
const Admin = require('../src/models/Admin');
const Settings = require('../src/models/Settings');
const Banner = require('../src/models/Banner');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';

async function seed() {
  try {
    console.log('Connecting to database:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('Database connected successfully.');

    // 1. Seed or Update Admin
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@nestammakkili.com').toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminNest2026!';
    const passwordHash = await bcrypt.hash(adminPass, 10);

    await Admin.findOneAndUpdate(
      { email: adminEmail },
      { email: adminEmail, passwordHash, role: 'admin' },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`Admin user seeded: ${adminEmail}`);

    // 2. Seed Default Settings
    const whatsapp = process.env.WHATSAPP_NUMBER || '919876543210';
    await Settings.findOneAndUpdate(
      {},
      {
        shippingCharge: 60,
        whatsappNumber: whatsapp,
        announcementText: {
          en: 'Soft, breathable nighties crafted for restful comfort. Prepaid orders only • Flat ₹60 shipping.',
          ml: 'സുഖകരവും ഗുണമേന്മയുള്ളതുമായ നൈറ്റികൾ. പ്രീപെയ്ഡ് ഓർഡറുകൾ മാത്രം • ഷിപ്പിംഗ് ₹60.'
        },
        lowStockThreshold: 3,
        social: {
          youtube: 'https://www.youtube.com/@nestammakkili',
          instagram: 'https://instagram.com/nestammakkili',
          facebook: ''
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    console.log('Settings initialized.');

    // 3. Seed Sample Banner
    await Banner.deleteMany({});
    await Banner.create({
      text: {
        en: 'New season nightwear collection now available. Watch fabrics & drape on YouTube before ordering.',
        ml: 'പുതിയ കളക്ഷൻ ഇപ്പോൾ ലഭ്യമാണ്. ഓർഡർ ചെയ്യുന്നതിന് മുൻപ് യൂട്യൂബിൽ കാണുക.'
      },
      link: '/shop',
      active: true,
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 30 * 86400000)
    });
    console.log('Banner seeded.');

    // 4. Seed Demo Products
    await Product.deleteMany({});

    const demoProducts = [
      {
        slug: 'rose-garden-nighty',
        name: {
          en: 'Rose Garden Nighty [DEMO]',
          ml: 'റോസ് ഗാർഡൻ നൈറ്റി [ഡെമോ]'
        },
        description: {
          en: 'A soft, comfortable nighty with romantic rose prints, crafted from pure breathable cotton. Ideal for everyday relaxed wear. [DEMO DATA: Replace with exact fabric specification before launch].',
          ml: 'മനോഹരമായ റോസ് പ്രിന്റുകളുള്ള ശുദ്ധമായ കോട്ടൺ നൈറ്റി. ദൈനംദിന ഉപയോഗത്തിന് അനുയോജ്യം. [ഡെമോ വിവരങ്ങൾ].'
        },
        style: 'Printed',
        price: 599,
        images: [
          '/img/placeholders/rose-garden-1.svg',
          '/img/placeholders/rose-garden-2.svg',
          '/img/placeholders/rose-garden-3.svg'
        ],
        videoUrl: 'https://www.youtube.com/@nestammakkili',
        sizes: [
          { size: 'M', stock: 5 },
          { size: 'L', stock: 4 },
          { size: 'XL', stock: 2 }, // low stock
          { size: 'XXL', stock: 6 },
          { size: '3XL', stock: 3 }
        ],
        tag: 'New',
        featured: true,
        active: true
      },
      {
        slug: 'blush-cotton-nighty',
        name: {
          en: 'Blush Cotton Nighty [DEMO]',
          ml: 'ബ്ലഷ് കോട്ടൺ നൈറ്റി [ഡെമോ]'
        },
        description: {
          en: 'Gentle blush tones on lightweight woven cotton. Tailored for comfort in warm climates with delicate piping detail. [DEMO DATA].',
          ml: 'ചൂടുള്ള കാലാവസ്ഥയ്ക്ക് ഇണങ്ങിയ മൃദുവായ കോട്ടൺ നൈറ്റി. [ഡെമോ വിവരങ്ങൾ].'
        },
        style: 'Cotton',
        price: 549,
        images: [
          '/img/placeholders/blush-cotton-1.svg',
          '/img/placeholders/blush-cotton-2.svg'
        ],
        videoUrl: 'https://www.youtube.com/@nestammakkili',
        sizes: [
          { size: 'M', stock: 8 },
          { size: 'L', stock: 5 },
          { size: 'XL', stock: 0 }, // sold out
          { size: 'XXL', stock: 3 },
          { size: '3XL', stock: 4 }
        ],
        tag: 'New',
        featured: true,
        active: true
      },
      {
        slug: 'velvet-evening-nighty',
        name: {
          en: 'Velvet Evening Nighty [DEMO]',
          ml: 'വെൽവെറ്റ് ഈവനിംഗ് നൈറ്റി [ഡെമോ]'
        },
        description: {
          en: 'Silky smooth satin nighty with deep crimson tones and elegant drape. Offers a featherlight luxurious feel. [DEMO DATA].',
          ml: 'മിനുസമാർന്നതും ഭംഗിയുള്ളതുമായ സാറ്റിൻ നൈറ്റി. [ഡെമോ വിവരങ്ങൾ].'
        },
        style: 'Satin',
        price: 749,
        images: [
          '/img/placeholders/velvet-evening-1.svg',
          '/img/placeholders/velvet-evening-2.svg'
        ],
        videoUrl: 'https://www.youtube.com/@nestammakkili',
        sizes: [
          { size: 'M', stock: 4 },
          { size: 'L', stock: 2 },
          { size: 'XL', stock: 3 },
          { size: 'XXL', stock: 1 },
          { size: '3XL', stock: 0 } // sold out
        ],
        tag: 'Bestseller',
        featured: true,
        active: true
      },
      {
        slug: 'petal-print-nighty',
        name: {
          en: 'Petal Print Nighty [DEMO]',
          ml: 'പെറ്റൽ പ്രിന്റ് നൈറ്റി [ഡെമോ]'
        },
        description: {
          en: 'Allover floral petal motifs on soft premium cotton. Pre-shrunk fabric ensuring reliable fit wash after wash. [DEMO DATA].',
          ml: 'പൂക്കളുടെ മനോഹരമായ ഡിസൈനുള്ള കോട്ടൺ നൈറ്റി. [ഡെമോ വിവരങ്ങൾ].'
        },
        style: 'Printed',
        price: 629,
        images: [
          '/img/placeholders/petal-print-1.svg'
        ],
        videoUrl: 'https://www.youtube.com/@nestammakkili',
        sizes: [
          { size: 'M', stock: 6 },
          { size: 'L', stock: 7 },
          { size: 'XL', stock: 5 },
          { size: 'XXL', stock: 4 },
          { size: '3XL', stock: 4 }
        ],
        tag: 'None',
        featured: false,
        active: true
      },
      {
        slug: 'dusk-floral-nighty',
        name: {
          en: 'Dusk Floral Nighty [DEMO]',
          ml: 'ഡസ്ക് ഫ്ലോറൽ നൈറ്റി [ഡെമോ]'
        },
        description: {
          en: 'Rich plum and dusk rose botanical design. Relaxed cut for unrestricted sleeping comfort with reinforced stitch lines. [DEMO DATA].',
          ml: 'മനോഹരമായ ഡസ്ക് ഫ്ലോറൽ ഡിസൈനിലുള്ള നൈറ്റി. [ഡെമോ വിവരങ്ങൾ].'
        },
        style: 'Cotton',
        price: 679,
        images: [
          '/img/placeholders/dusk-floral-1.svg'
        ],
        videoUrl: 'https://www.youtube.com/@nestammakkili',
        sizes: [
          { size: 'M', stock: 3 },
          { size: 'L', stock: 4 },
          { size: 'XL', stock: 2 },
          { size: 'XXL', stock: 5 },
          { size: '3XL', stock: 1 }
        ],
        tag: 'None',
        featured: false,
        active: true
      },
      {
        slug: 'cloud-soft-nighty',
        name: {
          en: 'Cloud Soft Nighty [DEMO]',
          ml: 'ക്ലൗഡ് സോഫ്റ്റ് നൈറ്റി [ഡെമോ]'
        },
        description: {
          en: 'Solid pastel tone, ultra-fine combed cotton that feels as light as a cloud against your skin. [DEMO DATA].',
          ml: 'വളരെ മൃദുവായ പ്യുവർ കോട്ടൺ പ്ലെയിൻ നൈറ്റി. [ഡെമോ വിവരങ്ങൾ].'
        },
        style: 'Plain',
        price: 499,
        images: [
          '/img/placeholders/cloud-soft-1.svg'
        ],
        videoUrl: 'https://www.youtube.com/@nestammakkili',
        sizes: [
          { size: 'M', stock: 10 },
          { size: 'L', stock: 8 },
          { size: 'XL', stock: 6 },
          { size: 'XXL', stock: 4 },
          { size: '3XL', stock: 5 }
        ],
        tag: 'None',
        featured: true,
        active: true
      }
    ];

    await Product.insertMany(demoProducts);
    console.log(`Seeded ${demoProducts.length} demo products successfully.`);

    console.log('--- SEEDING COMPLETE ---');
    console.log(`Admin Login Email: ${adminEmail}`);
    console.log(`Admin Login Password: ${adminPass}`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
