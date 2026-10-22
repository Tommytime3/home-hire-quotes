# Home Hire: homeowner capture link

A browser page homeowners open from a texted link or QR code. It walks them through filming and photographing their system, then uploads everything to Supabase for review. It works on any phone, with no app.

## Go live
1. Database: already set up in the Supabase project "home-hire-quotes".
2. Connection settings are built into `lib/supabase.ts` (the publishable key is safe to be public).
3. Deploy to Vercel (free): import the folder or repo and click Deploy. No settings to enter.
4. Your link is the Vercel URL. Turn it into a QR code for ads, trucks, and yard signs.

Each contractor gets their own link later: `your-url/?c=<contractor id>`.
