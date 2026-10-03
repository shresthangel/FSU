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
- Collects student opinions fast through online polls
- Keeps study material and opportunities in one shelf

Verified administrators get an **admin dashboard** to publish updates, handle support requests, and manage events and other student resources.

---

## Main features

### For students
- **Notice board:** latest notices, with categories (exam, event, scholarship, general) and search
- **Private support:** submit a complaint or suggestion, follow its status (Received, In progress, Solved), and exchange replies with the FSU team
- **Events and registration:** see upcoming programs, register in one click, get reminders
- **Polls and voting:** quick polls for campus issues, one vote per student
- **Opportunities page:** scholarships, internships, trainings, competitions
- **Lost and found:** post or find lost items on campus
- **Gallery:** photos from past programs
- **Meet the team:** FSU members, their roles, and how to contact them
- **Account profile:** manage the signed-in student account

### For FSU team (admin)
- Post and edit notices, events, polls, and opportunities
- See all complaints in one list, assign them, change status, and reply
- Review event registrations and export attendee lists
- Approve lost and found posts and manage gallery content
- Simple numbers on the dashboard: total complaints, solved ones, event sign-ups

---

## Tech stack

We kept it simple and popular so any student developer can understand and continue the work later.

| Part | What we use |
|---|---|
| Frontend | React, TypeScript, and Vite |
| Styling | CSS and Tailwind CSS |
| Backend services | Firebase Authentication, Cloud Firestore, and Cloud Storage |
| Hosting | Deploy to a host that supports Vite static builds |
| Version control | Git + GitHub |

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