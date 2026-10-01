# Rework the Features page closing copy

## What changes

The closing band at the bottom of the Features tab (HomeTabs.tsx, `FeaturesTab`) currently reads:

- Heading: "Stop sending the same resume into the dark."
- Lead: "Add your background once. Every application after that is written for the job, and every employer searching finds you too."

Replace it with the "be hunted, not chasing" direction the user picked:

- Heading: **"Stop chasing jobs. Start getting hunted."**
- Lead: **"One profile AYN turns into a tailored resume for every job you want. And when an employer is searching for someone like you, you are the name they find first."**

The "Start free" button, styling, and layout stay exactly as they are. This is copy only, two strings in `src/components/landing/HomeTabs.tsx`.

## House rules applied

- No em dashes, no en dashes, ranges use "to".
- Leads with being seen by employers (the positioning the user set), not just resume fixing.

## Verification

- Build passes; load the Features tab in the preview and confirm the new closing band renders with the "Start free" button intact.
