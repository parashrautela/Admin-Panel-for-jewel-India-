I am designing an internal Admin Panel for Jewels India,
a B2B gold jewellery marketplace. This panel is used 
by the solo founder to verify wholesaler onboarding 
submissions before they get access to the platform.

The wholesaler submits: name, Aadhaar (front + back), 
business name, state, city, business logo, PAN card, 
GST certificate. All stored in Supabase.

Build the complete admin panel with the following screens:

══════════════════════════════════════
SCREEN 1 — ADMIN DASHBOARD / HOME
══════════════════════════════════════

TOP NAV:
- Left: "JewelIndia Admin" — bold, logo mark "JI"
- Right: Admin avatar + "Parash" name + sign out

STATS ROW — 4 cards across top:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 24           │ │ 3            │ │ 148          │ │ 2            │
│ Pending      │ │ On Hold      │ │ Verified     │ │ Banned       │
│ review       │ │              │ │ total        │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
Pending card: amber left border
On Hold: blue left border
Verified: green left border
Banned: red left border

MAIN TABLE — Wholesaler submissions list:

Column headers:
Wholesaler | Business | Location | Submitted | Status | Action

Show 6 table rows with real data:

ROW 1:
- Avatar "RK" + "Ramesh Kumar"
- "RK Jewellers"
- "Surat, Gujarat"
- "2 hours ago"
- Status pill: "Pending" — amber bg, amber text
- Action: "Review →" blue text link

ROW 2:
- Avatar "MJ" + "Meena Joshi"
- "Meena Gold House"
- "Jaipur, Rajasthan"
- "5 hours ago"
- Status pill: "Pending" — amber
- Action: "Review →"

ROW 3:
- Avatar "PV" + "Prakash Verma"
- "PV Ornaments"
- "Chennai, Tamil Nadu"
- "Yesterday"
- Status pill: "On Hold" — blue bg, blue text
- Action: "Review →"

ROW 4:
- Avatar "AS" + "Ashok Shah"
- "Shah Fine Jewels"
- "Mumbai, Maharashtra"
- "2 days ago"
- Status pill: "Verified" ✓ — green bg, white text
- Action: "View →"

ROW 5:
- Avatar "LG" + "Lata Gupta"
- "Gupta Jewellers"
- "Pune, Maharashtra"
- "3 days ago"
- Status pill: "Resubmission" — orange bg, white text
- Action: "Review →"

ROW 6:
- Avatar "NK" + "Naresh Khatri"
- "NK Gold Works"
- "Ahmedabad, Gujarat"
- "5 days ago"
- Status pill: "Banned" — red bg, white text
- Action: "View →"

Table: white background, 1px #F0F0F0 row borders,
hover state: light grey #FAFAFA row background
Pagination at bottom: "Showing 1-6 of 24"

FILTER BAR above table:
[ All ] [ Pending 24 ] [ On Hold 3 ] 
[ Verified 148 ] [ Rejected 12 ] [ Banned 2 ]

Search input: "Search by name or business..."

══════════════════════════════════════
SCREEN 2 — WHOLESALER DETAIL / REVIEW PAGE
(opens when admin clicks "Review →")
══════════════════════════════════════

TWO COLUMN LAYOUT:
Left column (60%): Submitted information
Right column (40%): Admin action panel

LEFT COLUMN — Wholesaler Info:

SECTION HEADER:
Back arrow ← "Back to list"
"Reviewing: Ramesh Kumar" — 22px bold
"Submitted 2 hours ago · ORD-VER-2026-001"
Status pill: "Pending Review"

── PERSONAL DETAILS ──
Section heading: "Personal Details"
Light grey section card:

Full Name         Ramesh Kumar
Aadhaar Number    XXXX XXXX 3421
Submitted         March 29, 2026 at 2:14 AM

Aadhaar Front — document preview card:
┌──────────────────────────────┐
│  [Document image preview]    │
│  aadhaar_front.jpg           │
│  Uploaded · 2.3 MB           │
│  [ View Full Size ↗ ]        │
└──────────────────────────────┘

Aadhaar Back — same layout as above

── BUSINESS DETAILS ──
Section heading: "Business Details"

Business Name     RK Jewellers
State             Gujarat
City              Surat

Business Logo preview (circular, 64px)

── VERIFICATION DOCUMENTS ──
Section heading: "Verification Documents"

PAN Card preview card (same format as Aadhaar)
GST Certificate preview card

RIGHT COLUMN — Admin Action Panel:
Sticky, stays in view while scrolling left column

Card: white, 1px border, 12px radius, 24px padding

Heading: "Verification Decision"
Subtext: "Review all documents before taking action"

── ACTION BUTTONS ──

[ ✓ Verify & Approve ]
Solid green #27AE60, white text, full width, 48px
"Wholesaler gets immediate platform access"
12px muted text below button

[ ⏸ Put On Hold ]
Outlined blue border, blue text, full width, 48px
"Flag for further review without notifying"
12px muted text below button

[ ↩ Request Resubmission ]
Outlined amber border, amber text, full width, 48px
Clicking this expands a document checklist below:

DOCUMENT CHECKLIST (expands on click):
"Select which documents need to be resubmitted:"
☐ Aadhaar Front
☐ Aadhaar Back  
☐ PAN Card
☐ GST Certificate

Then reason text field:
"Add a reason for the wholesaler (required)"
Placeholder: "e.g. Aadhaar image is blurry and 
unreadable. Please upload a clearer photo."

[ Send Resubmission Request ] 
Solid amber, white text, full width

── DIVIDER ──

[ 🚫 Reject Application ]
Outlined red border, red text, full width, 48px
Clicking this expands:

REJECTION REASON SELECTOR:
"Select rejection reason:"

Radio buttons (select one):
○ Documents appear fraudulent or tampered
○ Business does not exist or unverifiable
○ Aadhaar details do not match business name
○ GST number is invalid or expired
○ PAN card does not match submitted details
○ Incomplete submission — missing documents
○ Duplicate account detected
○ Other (specify below)

Text field: "Additional notes (optional)"

[ Confirm Rejection ]
Solid red, white text, full width

── DIVIDER ──

[ ⛔ Ban Permanently ]
Text only, dark red #C0392B, centered
Small, not a full button — requires extra confirmation

Ban confirmation modal appears:
"Are you absolutely sure?"
"This will permanently ban Ramesh Kumar 
from the Jewels India platform. 
This action cannot be undone."
[ Cancel ] [ Yes, Ban Permanently ] — red

── ADMIN NOTES ──
Below all action buttons:
"Internal notes (not visible to wholesaler)"
Textarea, 4 lines, grey border
"Save note" — small text button

══════════════════════════════════════
SCREEN 3 — WHOLESALER DASHBOARD 
VERIFICATION STATUS STATES
(what the wholesaler sees on their end)
══════════════════════════════════════

Show 5 state variants of the 
"Under Verification" screen:

STATE 1 — Pending (default after submission)
Progress stepper:
✅ Account created
✅ Details submitted
⏳ Under verification (current — amber clock icon)

Heading: "You're all submitted!"
Body: "We're reviewing your details. 
We'll notify you within 24–48 hours 
once you're approved."
Help: "Need help? 9897453396"
CTA: "I understand" — black button

STATE 2 — Verified 🎉
Progress stepper:
✅ Account created
✅ Details submitted
✅ Verified (green checkmark)

Heading: "You're verified!"
Body: "Welcome to Jewels India. 
You can now start uploading your 
jewellery and reaching retailers 
across India."
CTA: "Go to Dashboard →" 
Solid black, prominent, full width
Subtle confetti or celebration 
illustration above heading

STATE 3 — Rejected
Progress stepper:
✅ Account created
✅ Details submitted
✗ Verification failed (red X icon)

Heading: "We couldn't verify your account"
Body: "Unfortunately your application 
was not approved."

Reason box (light red background, red border):
"Reason: GST number is invalid or expired. 
Please ensure your GST registration is 
active before reapplying."

CTA: "Contact support"
Secondary link: "Learn more about requirements"

STATE 4 — Resubmission Required
Progress stepper:
✅ Account created
✅ Details submitted
↩ Action required (amber icon)

Heading: "We need a few things from you"
Body: "Some of your documents need 
to be resubmitted."

Document list with status:
✅ Aadhaar Front — Accepted
✅ Aadhaar Back — Accepted
⚠️ PAN Card — Resubmit required
   "Image is blurry and unreadable. 
   Please upload a clearer photo."
✅ GST Certificate — Accepted

CTA: "Re-upload Documents →" — black button

STATE 5 — On Hold
Progress stepper:
✅ Account created
✅ Details submitted
⏸ Under additional review (blue icon)

Heading: "Your account is under review"
Body: "We're doing some additional checks 
on your account. This usually takes 
1–3 business days. We'll notify you 
once it's resolved."
Help: "Need help? 9897453396"
No CTA — just informational

══════════════════════════════════════
IN-APP NOTIFICATION — what wholesaler sees
when status changes
══════════════════════════════════════

Show notification banner at top of dashboard:

VERIFIED notification:
Green banner: "🎉 You're verified! 
You can now access your full dashboard."
[ Go to Dashboard ] white text button right

RESUBMISSION notification:
Amber banner: "⚠️ Action required — 
some documents need to be resubmitted."
[ Review now ] white text button right

REJECTED notification:
Red banner: "Your verification was unsuccessful. 
Tap to see the reason."
[ See details ] white text button right

══════════════════════════════════════
DESIGN RULES — ADMIN PANEL
══════════════════════════════════════

- Admin panel has a different visual language 
  from the wholesaler app — more utilitarian, 
  data-dense, professional
- Background: #F8F9FA light grey
- Cards: #FFFFFF white, 1px #E0E0E0 border,
  8px border radius
- Font: clean sans-serif throughout 
  (not serif — this is a data panel)
- Primary action green: #27AE60
- Hold blue: #2563EB
- Resubmission amber: #D97706
- Rejection red: #E53935
- Ban dark red: #C0392B
- Pending amber: #D4A017
- Table header: #F1F5F9 background, 
  #64748B text, 12px uppercase
- Status pills: colored background, 
  matching text, 6px border radius, 
  10px font, bold
- Nav: white background, 
  bottom border 1px #E0E0E0
- Sidebar width if needed: 240px
- Content max width: 1200px centered

══════════════════════════════════════
DESIGN RULES — WHOLESALER STATUS SCREENS
══════════════════════════════════════

- Match existing Jewels India onboarding 
  design system — white background, 
  serif headings, clean minimal aesthetic
- Keep same layout: left side heading + 
  step counter, right side content
- Progress stepper consistent across 
  all 5 states
- Notification banners: full width, 
  fixed at top, 56px height
- All CTAs: black background, 
  white text, 8px radius, 48px height