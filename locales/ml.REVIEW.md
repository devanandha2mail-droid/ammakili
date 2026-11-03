# Malayalam Localization Review Checklist (`locales/ml.REVIEW.md`)
**Project:** Nest by Ammakkili  
**Status:** Pre-launch Review Copy  
**Target Reviewer:** Native Malayalam speaker / Copywriter  

This document logs every Malayalam string introduced across the storefront and database to verify natural phrasing, correct grammar, and regional appropriateness for Kerala shoppers.

---

## 1. Brand & Navigation (`locales/ml.json` -> `site`, `nav`)

| Key | Malayalam Translation | English Meaning | Native Speaker Check |
|---|---|---|---|
| `site.title` | നെസ്റ്റ് ബൈ അമ്മക്കിളി | Nest by Ammakkili | [ ] Verified |
| `site.tagline` | സുഖകരമായ നൈറ്റ് വെയറുകൾ | Nightwear, softly considered | [ ] Verified |
| `site.description` | സ്ത്രീകൾക്കായുള്ള മനോഹരമായ നൈറ്റികൾ ലഭ്യമാക്കുന്ന ഓൺലൈൻ ഷോപ്പ്. ഗുണമേന്മയുള്ള തുണിത്തരങ്ങൾ, കൃത്യമായ അളവുകൾ, വാട്ട്‌സ്ആപ്പ് സപ്പോർട്ട്. | Shop description | [ ] Verified |
| `nav.home` | ഹോം | Home | [ ] Verified |
| `nav.shop` | ഷോപ്പ് | Shop | [ ] Verified |
| `nav.sizes` | സൈസ് ഗൈഡ് | Size guide | [ ] Verified |
| `nav.howToOrder` | എങ്ങനെ ഓർഡർ ചെയ്യാം | How to order | [ ] Verified |
| `nav.about` | ഞങ്ങളെക്കുറിച്ച് | About us | [ ] Verified |
| `nav.contact` | ബന്ധപ്പെടുക | Contact | [ ] Verified |
| `nav.wishlist` | വിഷ്‌ലിസ്റ്റ് | Wishlist | [ ] Verified |
| `nav.cart` | കാർട്ട് | Cart | [ ] Verified |
| `nav.track` | ഓർഡർ ട്രാക്ക് ചെയ്യാം | Track order | [ ] Verified |
| `nav.login` | സൈൻ ഇൻ | Sign In | [ ] Verified |
| `nav.account` | എന്റെ അക്കൗണ്ട് | My Account | [ ] Verified |

---

## 2. Core Business Policies (`locales/ml.json` -> `terms`, `policies`)

| Section | Malayalam Phrasing | Notes / Critical Rules |
|---|---|---|
| **Prepaid Payment** | "എല്ലാ ഓർഡറുകൾക്കും ഓൺലൈനായി മുൻകൂട്ടി പണം അടയ്ക്കണം. ക്യാഷ് ഓൺ ഡെലിവറി (COD) ലഭ്യമല്ല." | Enforces strictly no COD. |
| **No Returns/Exchanges** | "ഓർഡർ ചെയ്ത ശേഷം സൈസ് മാറ്റാനോ സാധനം തിരികെ നൽകാനോ സാധ്യമല്ല. ദയവായി സൈസ് ഉറപ്പുവരുത്തുക." | Crucial legal protection for intimate wear. |
| **WhatsApp Only** | "ഞങ്ങൾ ഫോൺ കോളുകൾ സ്വീകരിക്കാറില്ല. വാട്ട്‌സ്ആപ്പ് സന്ദേശങ്ങൾ അയക്കുക." | Strictly no phone calls. |
| **Flat Shipping** | "ഓർഡറുകൾക്ക് ഇന്ത്യയിലുടനീളം ₹60 ഫ്ലാറ്റ് ഷിപ്പിംഗ് നിരക്കായിരിക്കും. 1-2 പ്രവൃത്തിദിനങ്ങൾക്കുള്ളിൽ പാക്ക് ചെയ്തു അയക്കുന്നതാണ്." | Clear timeline and flat ₹60 cost. |

---

## 3. Product & Sizing Interaction (`locales/ml.json` -> `product`, `sizes`)

| Key | Malayalam Phrasing | Context |
|---|---|---|
| `product.addToCart` | കാർട്ടിലേക്ക് ചേർക്കൂ | Add to cart button |
| `product.soldOut` | തീർന്നുപോയി | Out of stock label |
| `product.onlyLeft` | `{size}` സൈസിൽ `{n}` എണ്ണം മാത്രം ബാക്കി | Scarcity indicator |
| `product.selectSizeFirst` | ദയവായി ആദ്യം സൈസ് തിരഞ്ഞെടുക്കുക. | Validation message |
| `sizes.calculatorTitle` | സൈസ് അറിയാം: നിങ്ങളുടെ ബസ്റ്റ് അളവ് ഇഞ്ചിൽ നൽകുക | Interactive bust finder |
| `sizes.calculatorHelp` | നിങ്ങൾക്ക് അനുയോജ്യമായ സൈസ് ഇവിടെ കാണിക്കും. | Result preview |
| `sizes.step1Title` | ഡിസൈൻ തിരഞ്ഞെടുക്കുക | Ordering step 1 |
| `sizes.step2Title` | സൈസ് ഉറപ്പാക്കുക | Ordering step 2 |
| `sizes.step3Title` | കാർട്ടിലേക്ക് മാറ്റുക | Ordering step 3 |
| `sizes.step4Title` | പണമടച്ച് സ്ഥിരീകരിക്കുക | Ordering step 4 |

---

## 4. Checkout & Order Confirmation (`locales/ml.json` -> `checkout`, `confirmation`)

| Key | Malayalam Phrasing | Context |
|---|---|---|
| `checkout.disclaimer` | ഓർഡർ നൽകിയ ശേഷം സൈസ് മാറ്റാനോ സാധനം തിരികെ നൽകാനോ കഴിയില്ലെന്ന് ഞാൻ മനസ്സിലാക്കുകയും സമ്മതിക്കുകയും ചെയ്യുന്നു. | Mandatory checkbox agreement |
| `checkout.placeOrder` | ₹`{total}` സുരക്ഷിതമായി നൽകുക | Razorpay trigger button |
| `confirmation.receivedMsg` | നിങ്ങളുടെ ഓർഡർ `{orderId}` വിജയകരമായി ലഭിച്ചിട്ടുണ്ട്. ഞങ്ങൾ വാട്ട്‌സ്ആപ്പിലൂടെ വിവരങ്ങൾ പങ്കുവെക്കുന്നതാണ്. | Confirmation toast / screen |
| `confirmation.sendWhatsApp` | ഓർഡർ വിവരങ്ങൾ വാട്ട്‌സ്ആപ്പിൽ അയക്കുക | Direct pre-filled WhatsApp link |

---

## 5. Demo Products Seeded in Database

| Product Slug | Seeded Malayalam Name (`name.ml`) | Seeded Malayalam Description (`description.ml`) |
|---|---|---|
| `rose-garden-nighty` | റോസ് ഗാർഡൻ നൈറ്റി | മനോഹരമായ റോസ് പ്രിന്റുകളുള്ള ശുദ്ധമായ കോട്ടൺ നൈറ്റി. ദൈനംദിന ഉപയോഗത്തിന് അനുയോജ്യം. |
| `blush-cotton-nighty` | ബ്ലഷ് കോട്ടൺ നൈറ്റി | ചൂടുള്ള കാലാവസ്ഥയ്ക്ക് ഇണങ്ങിയ മൃദുവായ കോട്ടൺ നൈറ്റി. |
| `velvet-evening-nighty`| വെൽവെറ്റ് ഈവനിംഗ് നൈറ്റി | മിനുസമാർന്നതും ഭംഗിയുള്ളതുമായ സാറ്റിൻ നൈറ്റി. |
| `petal-print-nighty` | പെറ്റൽ പ്രിന്റ് നൈറ്റി | പൂക്കളുടെ മനോഹരമായ ഡിസൈനുള്ള കോട്ടൺ നൈറ്റി. |
| `dusk-floral-nighty` | ഡസ്ക് ഫ്ലോറൽ നൈറ്റി | മനോഹരമായ ഡസ്ക് ഫ്ലോറൽ ഡിസൈനിലുള്ള നൈറ്റി. |
| `cloud-soft-nighty` | ക്ലൗഡ് സോഫ്റ്റ് നൈറ്റി | വളരെ മൃദുവായ പ്യുവർ കോട്ടൺ പ്ലെയിൻ നൈറ്റി. |

