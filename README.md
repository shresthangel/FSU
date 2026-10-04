# Hack Our Campus

### Our campus, our problem, our solution.

A one-stop website for the **Free Student Union (FSU)**, built so every student can raise their voice, stay updated, and take part in campus life without running behind people or notice boards.

---

## About the project

The FSU works for students, but right now most of its work happens on paper and social media(Facebook), in random chat groups, and by word of mouth. Students miss events, complaints get lost, and nobody knows what the union is actually doing.

This project is a single website where students and the FSU can meet. Public notices and published events are available to everyone; private student support and account features require sign-in.

---

## Problem statement

Here are the problems we see on our campus every day:

1. **Notices get missed.** Important notices are stuck on a notice board or shared in 10 different group chats. Many students never see them.
2. **Complaints go nowhere.** If a student has a problem (broken fan, dirty washroom, fee issue, unfair treatment), there is no clear way to report it. Many are scared to speak openly. And once they do, nobody tells them what happened next.
3. **Events are hard to follow.** Students hear about programs a day before, or after they are over. Registration is done through paper forms or messy Google Forms.
4. **No trust, no transparency.** Students do not know what the FSU is working on, who is in the team, or how decisions are made.
5. **Useful stuff is scattered.** scholarship news, internship info, lost and found items... all of this is spread around and often lost.
6. **Voting and opinions are slow.** Taking a student opinion on any issue means going class to class with a paper.

In short, students want to be heard and informed, and the union wants to help, but there is no good bridge between them.

---

## Our solution

The **FSU website** brings these workflows together:

- Gives students one place for all notices and events
- Lets students submit private complaints and suggestions and follow replies and status updates
- Shows what the FSU is doing, openly
- Collects event interest and suggestions from verified campus students
- Keeps study material and opportunities in one shelf

Verified administrators get an **admin dashboard** to publish updates, handle support requests, and manage events and other student resources.

---

## Main features

### For students
- **Notice board:** latest notices, with categories (exam, event, scholarship, general) and search
- **Private support:** submit a complaint or suggestion, follow its status (Received, In progress, Solved), and exchange replies with the FSU team
- **Events and registration:** see upcoming programs, register in one click, get reminders
- **Event feedback:** verified students can vote on whether an event should be organized and leave a suggestion
- **Opportunities page:** scholarships, internships, trainings, competitions
- **Lost and found:** post or find lost items on campus
- **Gallery:** photos from past programs
- **Meet the team:** FSU members, their roles, and how to contact them
- **Account profile:** manage the signed-in student account

### For FSU team (admin)
- Post and edit notices and events
- View event registrations and export attendee details to Excel
- See all complaints in one list, assign them, change status, and reply
- Add events, choose whether to collect student feedback, and review responses
- Add and remove gallery photos
- Add gallery photos using either a direct public image link or an uploaded file; published gallery links are visible to visitors and signed-in users
- Moderate lost and found posts
- Simple numbers on the dashboard: total complaints, solved ones, event sign-ups

---

## Run the app

The portal uses React 19, Vite, Tailwind CSS 4, shadcn/ui primitives, and an Express server, with Firebase Authentication, Cloud Firestore, and Firebase Storage. Students can sign up with any valid email address, verify that they own it, and submit their campus-issued student ID. An FSU admin must check the ID against official campus records and approve the request before student portal features are unlocked.

The React entry point in `src/` mounts the existing portal shell and initializes its feature controller in `app.js`. This compatibility layer intentionally keeps the current authentication, inbox, events, feedback, and admin behavior unchanged while the UI is migrated to reusable React/shadcn components.

1. Create a Firebase project and register a **Web app**. The current `firebase-client.js` is configured for project `fsuwebpage`; if you use another project, replace its Web app `apiKey`, `authDomain`, `projectId`, and `appId` with that project's values.
2. In Firebase Authentication → Sign-in method, enable **Email/Password** and configure the email verification template.
3. Create a Cloud Firestore database. In Storage, create/enable the project's default bucket and copy its exact bucket name from the Firebase console. The name may end in `.firebasestorage.app` or `.appspot.com`; use the value shown for your project rather than guessing it.
4. Set `VITE_FIREBASE_STORAGE_BUCKET` to that exact bucket name in the local build environment and in the production host's **build-time** environment variables. For local development, copy `.env.example` to `.env.local` and paste the bucket shown in Firebase Console → Storage; for a hosted site, add the same value to the host's environment-variable settings and rebuild/redeploy. The app accepts either the bucket name or a `gs://`-prefixed value. Vite embeds `VITE_` values at build time, so setting this only at runtime is not sufficient. If this value is missing, uploads stop before reaching Firebase and show setup instructions.
5. Authenticate the Firebase CLI with `npx firebase-tools login`, then publish the included security rules to this same project from the repository root:

   ```powershell
   npx firebase-tools deploy --only firestore:rules,storage --project fsuwebpage
   ```

   This deploys `firestore.rules` and `storage.rules`, as configured in `firebase.json`. You can also paste each file into its matching Firestore/Storage Rules page in the Firebase console and publish it there. The Storage rules allow public reads for gallery, notice, event, and Lost & Found images, while restricting uploads to verified admins (gallery, notice, event) or the approved student who owns the Lost & Found post. Limits match the forms: 1.5 MB for gallery, 5 MB for notice/event, and 1 MB for Lost & Found.
6. For a personal domain, add the exact domain (for example, `portal.example.com`, without `https://` or a path) in Firebase Authentication → Settings → Authorized domains. Keep the Firebase `authDomain` from the Web app configuration; it is not replaced by your custom website domain. Point your domain's DNS to your web host, configure HTTPS there, set the build-time Storage bucket variable, then build and deploy the site. Use `npm run build` and serve the generated `dist/` directory, or use `npm start` on a Node host.
7. Locally, run `npm install` and `npm run dev`, then open `http://127.0.0.1:5173`.
8. Create and verify an account for each intended admin. In Firebase Authentication → Users, copy an admin account's UID. In Firestore, create `admins/<UID>` with the string field `role: "admin"`. The admin must sign out and back in to refresh access. Only Firebase Console or trusted server tooling can grant/revoke admin access.

For a personal domain, add its exact hostname (without `https://` or a path) in Firebase Authentication → Settings → Authorized domains. Keep the Firebase `authDomain` from the Web app configuration; it is not replaced by the website's custom domain.

If an image upload reports that the bucket was not found, create the default bucket first in Firebase Console → Storage → Get started, then set `VITE_FIREBASE_STORAGE_BUCKET` to the exact name shown under Storage → Files and rebuild/redeploy. If upload permission is denied, confirm this is the same bucket whose rules you deployed, then deploy `storage.rules` to that Firebase project. Admin uploads additionally require the signed-in, email-verified account's UID to have an `admins/<UID>` document with `role: "admin"`; Lost & Found uploads require that UID's `studentVerifications/<UID>` record to have `status: "approved"`. Do not make the bucket public to work around a rules denial.

Students can start a private help/guidance conversation and continue replying in their inbox. FSU admins can see the support queue, assign conversations, update status, and reply. Firestore rules restrict each thread and its messages to its owner and authorized admins; the UI is not the privacy boundary.

If sign-in succeeds but shows a Firestore permissions warning, the student account is valid; publish the rules above to the configured Firebase project. The inbox stays unavailable until Firestore rules permit the signed-in student/admin to read their conversations.

### Firebase security notes

- Never put Firebase service-account keys or other server secrets in frontend code. The Firebase web app config is intended for client use; protect data with deployed Firestore rules.
- Deploy both `firestore.rules` and `storage.rules`; client-side checks alone do not protect student data or uploaded images.
- Email verification confirms account ownership only. Student membership is not self-asserted: admins must match the submitted student ID against official campus records before approving the request.
- Student verification records are private to the account owner and authorized admins. Only an authorized admin can list pending requests or approve/reject them.
- After email verification, students sign in and submit their campus ID from **My account**. Admins review requests in **Admin → Student verification**. Rejected requests can be corrected and resubmitted; approval unlocks access immediately.
- Admin access is granted only when a verified account has an `admins/<Firebase Auth UID>` document with `role: "admin"`. Manage that collection only in the Firebase console or trusted server; its rules prevent users from listing or modifying the allowlist.
- Firebase Web app settings are client configuration, not server secrets. Never put service-account keys or other server secrets in frontend code.
- `firestore.rules` allows visitors to read only the `portalContent/public` document; only verified admins can publish it. `storage.rules` allows public reads for the images the public portal displays, while restricting uploads/deletes to admins (notices, events, gallery) or the verified owner/admin (Lost & Found). Deploy both rule files before hosting; client-side checks do not protect Firebase data.
- Notices, events, opportunities, team details, and gallery metadata are stored in the single `portalContent/public` Firestore document. Every open page listens to that document with Firestore `onSnapshot`; new notices, edits, and image URLs are applied to other visitors' pages in real time. Lost & Found uses its own Firestore live listener. Uploaded image bytes are stored in Firebase Storage, and the public document/post stores the Firebase download URL and Storage path. Other users can display those images because Storage read rules permit the portal's public images.
- The footer shows Firebase's sync state. “Live updates on” means this browser has received server-backed content; “image uploads need setup” means the Storage bucket environment value is missing. Storage rules cannot fix a missing bucket setting: enable/create the bucket and configure the exact bucket name at build time. Publishing errors and Firestore permission/listener errors are shown instead of silently reporting success. Local storage is only an offline cache, never the cross-user source of truth.
- For a new domain or hosting deployment, authorize that domain in Firebase Authentication, set the exact `VITE_FIREBASE_STORAGE_BUCKET` at build time, deploy both rules, and rebuild the frontend. If changes are not visible, check the footer sync state, browser network, the Firebase project selected in `firebase-client.js`, the deployed rules, and the host's latest build.
- To add a linked gallery image, open **Admin → Gallery**, enter a caption, and paste a direct `https://` image URL in **Photo link**. The image host must allow public viewing/hotlinking; a sharing or web-page URL is not necessarily a direct image link. Publishing saves the URL to shared public portal content, so visitors do not need to sign in to view the gallery.

## Intended production stack

| Part | Current technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS, shadcn/ui |
| Authentication | Firebase Authentication (verified email/password) |
| Data and private inbox | Cloud Firestore with owner/admin security rules |
| Uploaded images | Firebase Storage with verified-student/admin rules |
| Server | Node.js and Express |
| Hosting | Node.js host (or Vercel, Render, or Cloudflare) |
| Version control | Git and GitHub |

## Who benefits

- **Students:** get heard, stay updated, never miss a program
- **FSU team:** work in an organized way and show their work openly
- **Campus management:** get clear, real issues from students instead of rumors
- **Future batches:** the notes, records, and history stay saved

---

## What we want to add later (Optional)

- Nepali and English language switch
- SMS and push notifications
- Online FSU election and voting system
- Clubs and committees section
- Anonymous chat with FSU counselors

---

## Team

| Name | Role |
|---|---|
| Nabin | Frontend / Backend |
| Binam | Frontend / Backend |
| Aabhas | Resources & Analysis |
| Angel | Testing and Feedback |

---

**Hack Our Campus: our campus, our problem, our solution.**