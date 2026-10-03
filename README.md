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
<<<<<<< HEAD

### For FSU team (admin)
- Post and edit notices and events
- View event registrations and export attendee details to Excel
- See all complaints in one list, assign them, change status, and reply
- Add events, choose whether to collect student feedback, and review responses
- Add and remove gallery photos
- Moderate lost and found posts
=======
- **Account profile:** manage the signed-in student account

### For FSU team (admin)
- Post and edit notices, events, polls, and opportunities
- See all complaints in one list, assign them, change status, and reply
- Review event registrations and export attendee lists
- Approve lost and found posts and manage gallery content
>>>>>>> 49dbf8b23be29a23e4d0514e7487164ee484838e
- Simple numbers on the dashboard: total complaints, solved ones, event sign-ups

---

## Run the app

The portal uses React 19, Vite, Tailwind CSS 4, shadcn/ui primitives, and an Express server, with Firebase Authentication/Cloud Firestore. Students can sign up with any valid email address, verify that they own it, and submit their campus-issued student ID. An FSU admin must check the ID against official campus records and approve the request before student portal features are unlocked.

<<<<<<< HEAD
The React entry point in `src/` mounts the existing portal shell and initializes its feature controller in `app.js`. This compatibility layer intentionally keeps the current authentication, inbox, events, feedback, and admin behavior unchanged while the UI is migrated to reusable React/shadcn components.

1. Create a Firebase project and register a **Web app**.
2. In Firebase Authentication, enable **Email/Password** sign-in and configure the email verification template.
3. Create a Cloud Firestore database.
4. Paste the Firebase **web app** values (`apiKey`, `authDomain`, `projectId`, and `appId`) into the `firebaseConfig` object in `firebase-client.js`.
5. In Firebase Console → **Firestore Database → Rules**, replace the rules with `firestore.rules` and click **Publish**. Confirm the console project is the same project ID shown in `firebase-client.js`.
   Alternatively, publish the rules from the project root with `npx firebase-tools deploy --only firestore:rules --project fsuwebpage`.
6. Run `npm install`, then `npm run dev`, and open `http://127.0.0.1:5173`. The Express server hosts Vite middleware and HMR during development; run `npm run build` followed by `npm start` to serve the production build.
7. Create an account for each intended admin using any valid email address and verify it.
8. In Firebase Authentication → Users, copy the admin account's UID. In Firestore, create a document at `admins/<UID>` using that exact UID as the document ID and add the string field `role` with value `admin`. The admin must sign out and back in to refresh access. Only Firebase Console or trusted server tooling can grant or revoke admin access; the client cannot edit this allowlist.

Students can start a private help/guidance conversation and continue replying in their inbox. FSU admins can see the support queue, assign conversations, update status, and reply. Firestore rules restrict each thread and its messages to its owner and authorized admins; the UI is not the privacy boundary.

If sign-in succeeds but shows a Firestore permissions warning, the student account is valid; publish the rules above to the configured Firebase project. The inbox stays unavailable until Firestore rules permit the signed-in student/admin to read their conversations.

### Firebase security notes

- Never put Firebase service-account keys or other server secrets in frontend code. The Firebase web app config is intended for client use; protect data with deployed Firestore rules.
- Deploy `firestore.rules`; client-side checks alone do not protect student messages.
- Email verification confirms account ownership only. Student membership is not self-asserted: admins must match the submitted student ID against official campus records before approving the request.
- Student verification records are private to the account owner and authorized admins. Only an authorized admin can list pending requests or approve/reject them.
- After email verification, students sign in and submit their campus ID from **My account**. Admins review requests in **Admin → Student verification**. Rejected requests can be corrected and resubmitted; approval unlocks access immediately.
- Admin access is granted only when a verified account has an `admins/<Firebase Auth UID>` document with `role: "admin"`. Manage that collection only in the Firebase console or trusted server; its rules prevent users from listing or modifying the allowlist.
- Configure Firebase Authentication's authorized domains for local development and your deployed site.
- Notices, events, event feedback, opportunities, gallery photos, and lost-and-found posts use browser local storage in this prototype and are not shared across browsers. Student ID approval is enforced by Firestore rules for Firestore-backed private features; demo content kept in local storage is not a server-side security boundary.

## Intended production stack

| Part | Planned technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS, shadcn/ui |
| Authentication | Firebase Authentication (verified email/password) |
| Private inbox | Cloud Firestore with owner/admin security rules |
| Server | Node.js and Express |
| Hosting | Node.js host (or Vercel, Render, or Cloudflare) |
| Version control | Git and GitHub |
=======
| Part | What we use |
|---|---|
| Frontend | React, TypeScript, and Vite |
| Styling | CSS and Tailwind CSS |
| Backend services | Firebase Authentication, Cloud Firestore, and Cloud Storage |
| Hosting | Deploy to a host that supports Vite static builds |
| Version control | Git + GitHub |
>>>>>>> 49dbf8b23be29a23e4d0514e7487164ee484838e

## Portal implementation

The Vite app includes responsive navigation, a searchable notice board with Exam, Event, Scholarship, and General categories, and real-time Firestore updates. Visitors can read notices without signing in. Signed-in students can register for events, vote in polls, manage their profile, and access private support; email verification is required for support conversations. Administrators manage notices, events, support requests, polls, opportunities, Lost and Found, and gallery content.

### Firebase setup

1. Create a Firebase project, register a Web app, enable **Email/Password** under Authentication → Sign-in method, and create Firestore and Storage.
2. Copy `.env.example` to `.env.local`, then set the Web app's API key, Auth domain, Project ID, Storage bucket, and App ID. Restart Vite after changing environment variables.
3. Deploy the included Firestore and Storage rules. The rules—not the client UI—enforce public reads, verified-user restrictions, ownership, and administrator access.
4. Create an account through the app and verify its email. To grant administrator access, find its UID in Firebase Authentication → Users, then create `admins/{uid}` in Firestore with `role: "admin"`. Provision admin records only through the Firebase Console or a trusted administrative environment; client writes to this collection are denied.
5. Run `npm test` for unit tests. Set `VITE_USE_FIREBASE_EMULATORS=true` in `.env.local` and run `npm run test:emulators` to exercise the Firestore, Storage, and Auth rules against the local emulators.

Firebase configuration is required; the app does not fall back to browser-local storage. Keep the included security rules deployed and grant admin records only through the Firebase console or another trusted administrative environment.

Run the frontend locally with `npm install` followed by `npm run dev`. Use `npm run build` to run the TypeScript checks and create a production build.

---

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