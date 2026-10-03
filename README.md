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
- Moderate lost and found posts
- Simple numbers on the dashboard: total complaints, solved ones, event sign-ups

---

## Run the app

The portal uses React 19, Vite, Tailwind CSS 4, shadcn/ui primitives, and an Express server, with Firebase Authentication, Cloud Firestore, and Firebase Storage. Students can sign up with any valid email address, verify that they own it, and submit their campus-issued student ID. An FSU admin must check the ID against official campus records and approve the request before student portal features are unlocked.

The React entry point in `src/` mounts the existing portal shell and initializes its feature controller in `app.js`. This compatibility layer intentionally keeps the current authentication, inbox, events, feedback, and admin behavior unchanged while the UI is migrated to reusable React/shadcn components.

1. Create a Firebase project and register a **Web app**.
2. In Firebase Authentication, enable **Email/Password** sign-in and configure the email verification template.
3. Create a Cloud Firestore database and a Firebase Storage bucket.
4. Confirm `firebase-client.js` uses the Firebase **web app** values (`apiKey`, `authDomain`, `projectId`, and `appId`). Set `VITE_FIREBASE_STORAGE_BUCKET` to the bucket name shown in Firebase Console (for example, `your-project.firebasestorage.app`) in the hosting environment before building.
5. Publish both `firestore.rules` and `storage.rules` to that same Firebase project. From the project root, run `npx firebase-tools deploy --only firestore:rules,storage --project fsuwebpage`, or publish each rules file in its matching Firebase Console section.
6. Run `npm install`, then `npm run dev`, and open `http://127.0.0.1:5173`. The Express server hosts Vite middleware and HMR during development; run `npm run build` followed by `npm start` to serve the production build.
7. Create an account for each intended admin using any valid email address and verify it.
8. In Firebase Authentication → Users, copy the admin account's UID. In Firestore, create a document at `admins/<UID>` using that exact UID as the document ID and add the string field `role` with value `admin`. The admin must sign out and back in to refresh access. Only Firebase Console or trusted server tooling can grant or revoke admin access; the client cannot edit this allowlist.

Students can start a private help/guidance conversation and continue replying in their inbox. FSU admins can see the support queue, assign conversations, update status, and reply. Firestore rules restrict each thread and its messages to its owner and authorized admins; the UI is not the privacy boundary.

If sign-in succeeds but shows a Firestore permissions warning, the student account is valid; publish the rules above to the configured Firebase project. The inbox stays unavailable until Firestore rules permit the signed-in student/admin to read their conversations.

### Firebase security notes

- Never put Firebase service-account keys or other server secrets in frontend code. The Firebase web app config is intended for client use; protect data with deployed Firestore rules.
- Deploy both `firestore.rules` and `storage.rules`; client-side checks alone do not protect student data or uploaded images.
- Email verification confirms account ownership only. Student membership is not self-asserted: admins must match the submitted student ID against official campus records before approving the request.
- Student verification records are private to the account owner and authorized admins. Only an authorized admin can list pending requests or approve/reject them.
- After email verification, students sign in and submit their campus ID from **My account**. Admins review requests in **Admin → Student verification**. Rejected requests can be corrected and resubmitted; approval unlocks access immediately.
- Admin access is granted only when a verified account has an `admins/<Firebase Auth UID>` document with `role: "admin"`. Manage that collection only in the Firebase console or trusted server; its rules prevent users from listing or modifying the allowlist.
- Configure Firebase Authentication's authorized domains for local development and your deployed site.
- Notices, published events, opportunities, team details, and gallery metadata sync through the admin-managed `portalContent/public` document. Gallery and Lost & Found images are stored in Firebase Storage; Lost & Found posts, event registrations, and event feedback are stored in Firestore. Local storage is only a cache, not the source of truth. Deploy the rules before hosting, and configure Firebase Authentication's authorized domains for the deployed site.

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