# Hack Our Campus

### Our campus, our problem, our solution.

A one-stop website for the **Free Student Union (FSU)**, built so every student can raise their voice, stay updated, and take part in campus life without running behind people or notice boards.

---

## About the project

The FSU works for students, but right now most of its work happens on paper and social media(Facebook), in random chat groups, and by word of mouth. Students miss events, complaints get lost, and nobody knows what the union is actually doing.

This project is a single website where students and the FSU can meet. It is simple to use, works on a phone, and keeps everything in one place.

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

We are building **one multipurpose FSU website** that does the following:

- Gives students one place for all notices and events
- Lets them submit complaints and suggestions (even anonymously) and track the progress
- Shows what the FSU is doing, openly
- Collects student opinions fast through online polls
- Keeps study material and opportunities in one shelf

The FSU team gets an **admin dashboard** to post updates, handle complaints, and manage events without needing any technical skill.

---

## Main features

### For students
- **Notice board:** latest notices, with categories (exam, event, scholarship, general) and search
- **Complaint and suggestion box:** submit a problem with a photo if needed. Choose to stay anonymous. Get a tracking ID and see the status (Received, In progress, Solved)
- **Events and registration:** see upcoming programs, register in one click, get reminders
- **Polls and voting:** quick polls for campus issues, one vote per student
- **Opportunities page:** scholarships, internships, trainings, competitions
- **Lost and found:** post or find lost items on campus
- **Gallery:** photos from past programs
- **Meet the team:** FSU members, their roles, and how to contact them
- **Member sign up:** students can join the FSU and get a member profile

### For FSU team (admin)
- Post and edit notices and events
- See all complaints in one list, assign them, change status, and reply
- Create polls and see the results
- Approve resources and lost and found posts
- Simple numbers on the dashboard: total complaints, solved ones, event sign-ups

---

## Tech stack

We kept it simple and popular so any student developer can understand and continue the work later.

| Part | What we use | 
|---|---|
| Frontend | React (with Vite) |
| Styling | Tailwind CSS |
| UI Library | Shacdn/UI |
| Backend | Node.js + Express |
| Database | Firebase / Supabase |
| Login | Firebase |
| Hosting | Vercel, Render, CloudFare |
| Version control | Git + GitHub |

## Current frontend implementation

The current Vite app includes the responsive public navigation, mobile bottom tabs and menu, theme toggle, landing page sections, and an admin dashboard preview. Navigation is client-side; sign-in and admin preview actions are UI demonstrations only and are not connected to an authentication service or backend yet.

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