import { strToU8, zipSync } from 'fflate';
import {
  addDoc,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  firebaseProjectId,
  getDocs,
  getDoc,
  isFirebaseConfigured,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  sendEmailVerification,
  sendPasswordResetEmail,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  where,
  storage,
} from './firebase-client.js';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

/* ============================================================
   Hack Our Campus — FSU Portal
   All interactivity: navigation, forms, storage, admin
   ============================================================ */

/* ---------- Constants ---------- */
const STORE_KEY = 'hack_our_campus_v1';
const ADMIN_TAB_KEY = 'hoc_admin_tab';
const ADMIN_NOTIFICATIONS_KEY = 'hoc_admin_notifications';
const EVENT_FEEDBACK_CHOICES = ['Yes', 'No', 'Maybe'];

/* ---------- Tiny DOM helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let currentUser = null;
let isAdminUser = false;
let studentVerification = null;
let isRegisterMode = false;
let authNotice = '';
let verificationUnsubscribe = null;
let supportRequestUnsubscribe = null;
const supportMessageUnsubscribers = new Map();
let supportRequests = [];
let supportMessages = new Map();
let supportRequestsLoaded = false;
let supportRequestsError = '';
let adminNotificationUnsubscribers = [];
let adminNotificationUserId = '';
let adminNotificationUnread = {
  complaints: false,
  verifications: false,
  notices: false,
};
let lostFoundUnsubscribe = null;
let participationUnsubscribers = [];
let participationSubscriptionKey = '';
let noticeDetailReturnFocus = null;
let noticeDetailPreviousOverflow = '';

/* ---------- ID generators ---------- */
function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
/* ---------- Date helpers ---------- */
function nowISO() { return new Date().toISOString(); }
function dateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}
function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch { return iso; }
}
function fmtDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return iso; }
}

function hasCampusAccess(user = currentUser) {
  return Boolean(user?.emailVerified && (isAdminUser || studentVerification?.status === 'approved'));
}

function isValidEmail(value) {
  if (value.length > 254) return false;
  const separator = value.indexOf('@');
  if (separator < 1 || separator !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, separator);
  const domainLabels = value.slice(separator + 1).split('.');
  return local.length <= 64
    && !local.startsWith('.')
    && !local.endsWith('.')
    && !local.includes('..')
    && /^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+$/i.test(local)
    && domainLabels.length >= 2
    && domainLabels.every(label => label.length <= 63
      && /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label));
}

function isValidSignupPassword(value) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function isTenDigitPhone(value) {
  return /^\d{10}$/.test(value);
}

function lineIcon(name, className = '') {
  const icons = {
    notice: ['book-open-text', '<path d="M12 5v16"/><path d="M16 13h2"/><path d="M16 9h2"/><path d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z"/><path d="M6 13h2"/><path d="M6 9h2"/>'],
    calendar: ['calendar-days', '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/><path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>'],
    opportunity: ['sliders-horizontal', '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>'],
    support: ['message-circle', '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>'],
    arrow: ['arrow-right', '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'],
    arrowUpRight: ['arrow-up-right', '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>'],
    building: ['building-complex', '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>'],
    clock: ['clock-3', '<circle cx="12" cy="12" r="10"/><path d="M12 6v6h4"/>'],
    location: ['map-pin', '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'],
    users: ['users-round', '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>'],
    phone: ['phone', '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>'],
    calendarPlus: ['calendar-plus', '<path d="M16 18h6"/><path d="M16 2v3"/><path d="M19 15v6"/><path d="M21 11.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.3"/><path d="M3 9h18"/><path d="M8 2v3"/>'],
    check: ['check', '<path d="M20 6 9 17l-5-5"/>'],
  };
  const icon = icons[name];
  if (!icon) throw new Error(`Unknown Lucide icon: ${name}`);
  const [iconName, nodes] = icon;
  return `<svg class="lucide lucide-${iconName} line-icon ${escapeAttr(className)}" data-lucide="${iconName}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${nodes}</svg>`;
}

/* ---------- Placeholder image (SVG data URI) ---------- */
function placeholderImage(label, c1 = '#1d4ed8', c2 = '#7c3aed') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="400" height="300" fill="url(#g)"/>
    <text x="50%" y="50%" fill="#ffffff" font-family="sans-serif"
      font-size="22" font-weight="700" text-anchor="middle"
      dominant-baseline="middle">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function updateThemeToggle() {
  const isDark = document.body.classList.contains('theme-dark');
  const toggle = $('#themeToggle');
  toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

/* ============================================================
   STATE
   ============================================================ */
function defaultState() {
  return {
    notices: [
      { id: uid('n'), title: 'Mid-term exam routine published',
        body: 'The mid-term examination routine for all semesters is now available at the exam section. Exams begin from the 15th of this month.',
        category: 'exam', date: nowISO() },
      { id: uid('n'), title: 'Free health check-up camp',
        body: 'A free health check-up camp is being organized by the FSU in the main hall this Friday from 10 AM to 3 PM. All students are welcome.',
        category: 'event', date: nowISO() },
      { id: uid('n'), title: 'Merit scholarship — apply by 30th',
        body: 'Students with 80%+ attendance and a GPA of 3.5 or above can apply for the merit scholarship. Forms available at the FSU office.',
        category: 'scholarship', date: nowISO() },
      { id: uid('n'), title: 'Library timings extended during exams',
        body: 'The central library will remain open until 9 PM during the examination period.',
        category: 'general', date: nowISO() },
    ],
    complaints: [],
    events: [
      { id: uid('e'), title: 'Freshers\' Welcome',
        date: dateAfter(7), time: '11:00 AM', location: 'Main Auditorium',
        description: 'A warm welcome program for our new students with cultural performances, games and refreshments.',
        registrations: [], feedbackPoll: { enabled: true, responses: [] } },
      { id: uid('e'), title: 'Inter-college Coding Hackathon',
        date: dateAfter(14), time: '9:00 AM', location: 'Computer Lab, Block C',
        description: 'A 12-hour coding marathon. Form your team of 3 and build something amazing. Prizes worth Rs. 50,000.',
        registrations: [], feedbackPoll: { enabled: true, responses: [] } },
      { id: uid('e'), title: 'Blood Donation Camp',
        date: dateAfter(21), time: '8:00 AM', location: 'Campus Ground',
        description: 'In partnership with the Red Cross. Donors receive a certificate and refreshments.',
        registrations: [], feedbackPoll: { enabled: true, responses: [] } },
    ],
    opportunities: [
      { id: uid('o'), title: 'Merit Scholarship',
        type: 'Scholarship', org: 'National Education Trust',
        deadline: dateAfter(30),
        description: 'Full tuition coverage for top-performing students. Requires GPA 3.6+ and two recommendation letters.',
        link: '#' },
      { id: uid('o'), title: 'Frontend Developer Intern',
        type: 'Internship', org: 'TechNepal Pvt. Ltd.',
        deadline: dateAfter(45),
        description: '6-month paid internship. React + Tailwind skills required. Remote-friendly.',
        link: '#' },
      { id: uid('o'), title: 'AI & Data Science Training',
        type: 'Training', org: 'FSU Skill Cell',
        deadline: dateAfter(10),
        description: 'Free 4-week weekend training on Python, pandas and basic machine learning.',
        link: '#' },
      { id: uid('o'), title: 'National Innovation Challenge',
        type: 'Competition', org: 'Ministry of Education',
        deadline: dateAfter(60),
        description: 'Pitch your campus-based solution. Winners get seed funding and mentorship.',
        link: '#' },
    ],
    lostfound: [
      { id: uid('lf'), type: 'lost', title: 'Black wallet',
        location: 'Block B canteen', contact: '98XXXXXXXX',
        description: 'Contains my ID card and some cash. Please return if found.',
        date: nowISO(), approved: true },
      { id: uid('lf'), type: 'found', title: 'Blue water bottle',
        location: 'Library 2nd floor', contact: 'library@campus.edu',
        description: 'Found near the reading tables. Kept at the front desk.',
        date: nowISO(), approved: true },
    ],
    gallery: [
      { id: uid('g'), caption: 'Fresher\'s Welcome 2024', image: placeholderImage('Welcome', '#1d4ed8', '#7c3aed') },
      { id: uid('g'), caption: 'Coding Hackathon', image: placeholderImage('Hackathon', '#0f9d58', '#1d4ed8') },
      { id: uid('g'), caption: 'Blood Donation Camp', image: placeholderImage('Blood Drive', '#d93025', '#b7791f') },
      { id: uid('g'), caption: 'Annual Sports Day', image: placeholderImage('Sports', '#b7791f', '#0f9d58') },
      { id: uid('g'), caption: 'Cultural Night', image: placeholderImage('Culture', '#7c3aed', '#d93025') },
      { id: uid('g'), caption: 'Tree Plantation Drive', image: placeholderImage('Plantation', '#0f9d58', '#526480') },
    ],
    team: [
      { name: 'Nabin',  role: 'Frontend / Backend' },
      { name: 'Binam',  role: 'Frontend / Backend' },
      { name: 'Aabhas', role: 'Resources & Analysis' },
      { name: 'Angel',  role: 'Testing and Feedback' },
    ],
    eventRegs: [],   // ids of events this browser has registered for
  };
}

let state = loadState();
let portalContentUnsubscribe = null;
let portalContentWriteTimer = null;
let portalContentWriteQueue = Promise.resolve();
let portalContentExists = false;
let portalContentLoaded = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = Object.assign(defaultState(), parsed);
      // Normalise event registrations (older data may just be {date:...})
      merged.events.forEach(ev => {
        ev.registrations = (ev.registrations || []).map(r => ({
          id: r.id || uid('reg'),
          name: r.name || '',
          email: r.email || '',
          phone: r.phone || '',
          dept: r.dept || '',
          date: r.date || nowISO(),
        }));
      });
      return merged;
    }
  } catch (e) { /* ignore corrupt storage */ }
  return defaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Changes remain active, but this browser could not cache them.', 'error');
  }
  if (isAdminUser) queuePublicContentWrite();
}

function cacheStateLocally() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    toast('Updated data could not be cached in this browser.', 'error');
  }
}

function publicContentSnapshot() {
  const bytes = value => new Blob([JSON.stringify(value)]).size;
  const content = {
    notices: state.notices,
    events: state.events.map(event => {
      const { registrations = [], feedbackPoll, ...publicEvent } = event;
      return {
        ...publicEvent,
        registrationCount: registrations.length,
        feedbackPoll: feedbackPoll
          ? {
              enabled: Boolean(feedbackPoll.enabled),
              question: feedbackPoll.question || '',
              feedbackCount: feedbackPoll.responses?.length || 0,
            }
          : null,
        feedbackCount: feedbackPoll?.responses?.length || 0,
      };
    }),
    opportunities: state.opportunities,
    gallery: state.gallery,
    team: state.team,
    updatedAt: serverTimestamp(),
  };
  if (bytes(content) > 900_000) {
    throw new Error('Published content is too large to store safely in Firestore. Remove large items or images and try again.');
  }
  return content;
}

function queuePublicContentWrite() {
  if (!db || !isFirebaseConfigured) {
    toast('Firebase is not configured; portal content was saved only in this browser.', 'error');
    return;
  }
  clearTimeout(portalContentWriteTimer);
  portalContentWriteTimer = setTimeout(() => persistPublicContentNow().catch(() => undefined), 250);
}

async function persistPublicContentNow() {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase is not configured; portal content cannot be saved to the cloud.');
  }
  clearTimeout(portalContentWriteTimer);
  try {
    const content = publicContentSnapshot();
    const write = portalContentWriteQueue
      .catch(() => undefined)
      .then(() => setDoc(doc(db, 'portalContent', 'public'), content));
    portalContentWriteQueue = write;
    await write;
    portalContentExists = true;
  } catch (error) {
    toast(`Cloud content could not be saved: ${firebaseErrorMessage(error)}`, 'error');
    throw error;
  }
}

function mergePublicContent(content) {
  const currentEvents = new Map(state.events.map(event => [event.id, event]));
  state = {
    ...state,
    notices: Array.isArray(content.notices) ? content.notices : state.notices,
    events: Array.isArray(content.events) ? content.events.map(event => {
      const localEvent = currentEvents.get(event.id);
      return {
        ...event,
        registrations: localEvent?.registrations || [],
        feedbackPoll: event.feedbackPoll
          ? {
              ...event.feedbackPoll,
              feedbackCount: event.feedbackCount || event.feedbackPoll.feedbackCount || 0,
              responses: localEvent?.feedbackPoll?.responses || [],
            }
          : null,
      };
    }) : state.events,
    opportunities: Array.isArray(content.opportunities) ? content.opportunities : state.opportunities,
    gallery: Array.isArray(content.gallery) ? content.gallery : state.gallery,
    team: Array.isArray(content.team) ? content.team : state.team,
  };
  updateAdminSectionNotifications('notices', state.notices.map(notice => notice.id));
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    toast('Cloud content loaded, but this browser could not cache a local copy.', 'error');
  }
  renderHome();
  if ($('#page-notices').classList.contains('active')) renderNotices();
  if (!$('#noticeDetail').classList.contains('hidden')) {
    const openNotice = state.notices.find(notice => notice.id === $('#noticeDetail').dataset.noticeId);
    if (openNotice) renderNoticeDetail(openNotice);
    else closeNoticeDetail();
  }
  if ($('#page-events').classList.contains('active')) renderEvents();
  if ($('#page-opportunities').classList.contains('active')) renderOpportunities();
  if ($('#page-lostfound').classList.contains('active')) renderLostFound();
  if ($('#page-gallery').classList.contains('active')) renderGallery();
  if ($('#page-admin').classList.contains('active') && isAdminUser) renderAdmin();
  watchStudentParticipation();
}

function startPublicContentSync() {
  if (!db || !isFirebaseConfigured || portalContentUnsubscribe) return;
  portalContentUnsubscribe = onSnapshot(
    doc(db, 'portalContent', 'public'),
    snapshot => {
      portalContentLoaded = true;
      portalContentExists = snapshot.exists();
      if (portalContentExists) mergePublicContent(snapshot.data());
      else if (isAdminUser) queuePublicContentWrite();
    },
    error => {
      toast(`Portal content could not be loaded from Firebase: ${firebaseErrorMessage(error)}`, 'error');
    },
  );
}

function stopParticipationSubscriptions() {
  participationUnsubscribers.forEach(unsubscribe => unsubscribe());
  participationUnsubscribers = [];
  participationSubscriptionKey = '';
}

function watchStudentParticipation() {
  if (!db || !hasCampusAccess() || isAdminUser) {
    stopParticipationSubscriptions();
    return;
  }
  const eventKey = state.events.map(event => event.id).join('|');
  const userUid = currentUser.uid;
  const subscriptionKey = `${userUid}:${eventKey}`;
  if (participationSubscriptionKey === subscriptionKey) return;
  stopParticipationSubscriptions();
  participationSubscriptionKey = subscriptionKey;

  for (const event of state.events) {
    const registrationRef = doc(db, 'events', event.id, 'registrations', userUid);
    participationUnsubscribers.push(onSnapshot(registrationRef, snapshot => {
      const currentEvent = state.events.find(item => item.id === event.id);
      if (!currentEvent) return;
      currentEvent.registrations = snapshot.exists() ? [snapshot.data()] : [];
      state.eventRegs = state.eventRegs.filter(id => id !== event.id);
      if (snapshot.exists()) state.eventRegs.push(event.id);
      currentEvent.registrationCount = Math.max(
        currentEvent.registrationCount || 0,
        currentEvent.registrations.length,
      );
      cacheStateLocally();
      if ($('#page-events').classList.contains('active')) renderEvents();
    }, error => {
      toast(`Your event registration could not be loaded: ${firebaseErrorMessage(error)}`, 'error');
    }));

    const feedbackRef = doc(db, 'events', event.id, 'feedback', userUid);
    participationUnsubscribers.push(onSnapshot(feedbackRef, snapshot => {
      const currentEvent = state.events.find(item => item.id === event.id);
      if (!currentEvent?.feedbackPoll) return;
      currentEvent.feedbackPoll.responses = snapshot.exists()
        ? [{ ...snapshot.data(), userId: userUid }]
        : [];
      currentEvent.feedbackPoll.feedbackCount = Math.max(
        currentEvent.feedbackPoll.feedbackCount || 0,
        currentEvent.feedbackPoll.responses.length,
      );
      cacheStateLocally();
      if ($('#page-events').classList.contains('active')) renderEvents();
    }, error => {
      toast(`Your event feedback could not be loaded: ${firebaseErrorMessage(error)}`, 'error');
    }));
  }
}

function startLostFoundSync() {
  if (!db || !isFirebaseConfigured || lostFoundUnsubscribe) return;
  lostFoundUnsubscribe = onSnapshot(
    query(collection(db, 'lostFoundPosts'), where('approved', '==', true)),
    snapshot => {
      state.lostfound = snapshot.docs.map(post => ({ ...post.data(), id: post.id }));
      cacheStateLocally();
      renderLostFound();
      if ($('#page-home').classList.contains('active')) renderHome();
    },
    error => toast(`Lost & Found posts could not be loaded: ${firebaseErrorMessage(error)}`, 'error'),
  );
}

async function loadAdminLostFound() {
  if (!db || !isAdminUser) return;
  try {
    const posts = await getDocs(collection(db, 'lostFoundPosts'));
    if (!isAdminUser) return;
    state.lostfound = posts.docs.map(post => ({ ...post.data(), id: post.id }));
    cacheStateLocally();
  } catch (error) {
    toast(`Lost & Found posts could not be loaded: ${firebaseErrorMessage(error)}`, 'error');
  }
}

async function loadAdminEventParticipation() {
  if (!db || !isAdminUser) return;
  try {
    const participation = await Promise.all(state.events.map(async event => {
      const [registrations, feedback] = await Promise.all([
        getDocs(collection(db, 'events', event.id, 'registrations')),
        getDocs(collection(db, 'events', event.id, 'feedback')),
      ]);
      return {
        eventId: event.id,
        registrations: registrations.docs.map(item => item.data()),
        responses: feedback.docs.map(item => ({ ...item.data(), userId: item.id })),
      };
    }));
    if (!isAdminUser) return;
    let publicCountsChanged = false;
    participation.forEach(({ eventId, registrations, responses }) => {
      const event = state.events.find(item => item.id === eventId);
      if (!event) return;
      if (event.registrationCount !== registrations.length
        || (event.feedbackPoll && event.feedbackPoll.feedbackCount !== responses.length)) {
        publicCountsChanged = true;
      }
      event.registrations = registrations;
      event.registrationCount = registrations.length;
      if (event.feedbackPoll) {
        event.feedbackPoll.responses = responses;
        event.feedbackPoll.feedbackCount = responses.length;
      }
    });
    if (publicCountsChanged) saveState();
    if ($('#page-admin').classList.contains('active')
      && sessionStorage.getItem(ADMIN_TAB_KEY) === 'events') {
      const content = $('#adminContent');
      content.innerHTML = adminEvents();
      bindAdminEvents();
    }
    if ($('#page-events').classList.contains('active')) renderEvents();
  } catch (error) {
    toast(`Event participation could not be loaded: ${firebaseErrorMessage(error)}`, 'error');
  }
}

/* ============================================================
   TOAST + MODAL
   ============================================================ */
let toastTimer = null;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + type; }, 2600);
}

function openModal(html) {
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = '';
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGES = ['home','notices','complaints','events','opportunities',
               'lostfound','gallery','team','login','admin'];
const RESTRICTED_PAGES = new Set(['complaints', 'admin']);
const THEME_KEY = 'hoc_color_theme';

function navigate(page) {
  if (!PAGES.includes(page)) page = 'home';
  if (!hasCampusAccess() && RESTRICTED_PAGES.has(page)) page = 'login';
  if (page !== 'complaints' && page !== 'admin') stopSupportListeners();
  if (page !== 'admin') stopAdminNotifications();
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  $$('.main-nav a').forEach(a => {
    const current = a.dataset.page === page;
    a.classList.toggle('active', current);
    a.setAttribute('aria-current', current ? 'page' : 'false');
  });

  $('#mainNav').classList.remove('open');
  $('#navToggle').classList.remove('is-open');
  $('#navToggle').setAttribute('aria-expanded', 'false');
  $('#navToggle').setAttribute('aria-label', 'Open navigation menu');
  $('#moreMenu').classList.add('hidden');
  $('#moreToggle').setAttribute('aria-expanded', 'false');
  $('#moreToggle').classList.toggle('active', ['opportunities', 'gallery', 'team', 'admin'].includes(page));

  if (page === 'home')          renderHome();
  if (page === 'notices')       renderNotices();
  if (page === 'complaints')    renderComplaintsPage();
  if (page === 'login')         renderAuthPage();
  if (page === 'events')        renderEvents();
  if (page === 'opportunities') renderOpportunities();
  if (page === 'lostfound')     renderLostFound();
  if (page === 'gallery')       renderGallery();
  if (page === 'team')          renderTeam();
  if (page === 'admin')         renderAdmin();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   RENDERERS
   ============================================================ */

/* ---------- HOME ---------- */
function renderHome() {
  const upcomingEvents = state.events.filter(ev => !ev.date || ev.date >= dateAfter(0));
  const publishedOpportunities = state.opportunities.filter(opportunity => opportunity.approved !== false);
  const stats = [
    { value: state.notices.length, label: 'Current notices', icon: 'notice' },
    { value: upcomingEvents.length, label: 'Upcoming events', icon: 'calendar' },
    { value: publishedOpportunities.length, label: 'Opportunities', icon: 'opportunity' },
  ];
  $('#homeStats').innerHTML = stats.map(s => `
    <div class="stat">
      ${lineIcon(s.icon, 'stat-icon')}
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
  const latest = state.notices.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  $('#homeNotices').innerHTML = latest.length ? latest.map(n => `
  <button class="home-notice notice-card-${escapeAttr(n.category)}" data-notice-id="${escapeAttr(n.id)}" aria-label="Read notice: ${escapeAttr(n.title)}">
    <span class="home-notice-image" aria-hidden="true">${n.image ? `<img class="notice-card-photo" src="${escapeAttr(n.image)}" alt="" loading="lazy">` : ''}</span>
    <span class="home-notice-content">
      <span class="home-notice-heading">
        <span class="home-notice-title">${escapeHtml(n.title)}</span>
        <span class="home-notice-category">${escapeHtml(n.category)}</span>
      </span>
      <span class="home-notice-date muted small">${lineIcon('calendar', 'notice-date-icon')}${fmtDate(n.date)}</span>
      <span class="home-notice-arrow" aria-hidden="true">${lineIcon('arrowUpRight')}</span>
    </span>
  </button>
  `).join('') : '<p class="muted small">No notices posted yet.</p>';
}

/* ---------- NOTICES ---------- */
function renderNotices() {
  const q = ($('#noticeSearch')?.value || '').toLowerCase().trim();
  const cat = $('#noticeCategory')?.value || 'all';

  let items = state.notices.slice().sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );

  if (cat !== 'all') items = items.filter(n => n.category === cat);
  if (q) items = items.filter(n =>
    n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
  );

  const list = $('#noticeList');
  if (!items.length) {
    list.innerHTML = `<div class="empty">No notices match your filter.</div>`;
    return;
  }

  list.innerHTML = items.map(n => `
    <article class="notice-card notice-card-${escapeAttr(n.category)}" data-notice-id="${escapeAttr(n.id)}" role="button" tabindex="0" aria-label="Read notice: ${escapeAttr(n.title)}">
      <div class="notice-card-image" aria-hidden="true">
        ${n.image ? `<img class="notice-card-photo" src="${escapeAttr(n.image)}" alt="" loading="lazy">` : ''}
        <span class="notice-image-category">${escapeHtml(n.category)}</span>
      </div>
      <div class="notice-card-content">
        <div class="notice-card-heading">
          <h3 class="notice-card-title">${escapeHtml(n.title)}</h3>
        </div>
        <div class="notice-card-date">${lineIcon('calendar')}<time>${fmtDate(n.date)}</time></div>
        <p class="notice-card-body">${escapeHtml(n.body)}</p>
        <span class="notice-card-arrow" aria-hidden="true">${lineIcon('arrowUpRight')}</span>
      </div>
    </article>
  `).join('');
}

function renderNoticeDetail(notice) {
  const detail = $('#noticeDetail');
  detail.dataset.noticeId = notice.id;
  $('#noticeDetailContent').innerHTML = `
    <header class="notice-detail-toolbar">
      <button class="notice-detail-back" type="button" data-close-notice-detail>
        <span aria-hidden="true">←</span> Back to notices
      </button>
      <span class="notice-detail-context">Campus notice</span>
    </header>
    <article class="notice-detail-article notice-card-${escapeAttr(notice.category)}">
      <div class="notice-detail-cover notice-card-image" aria-hidden="true">
        ${notice.image ? `<img class="notice-card-photo" src="${escapeAttr(notice.image)}" alt="">` : ''}
        <span class="notice-image-category">${escapeHtml(notice.category)}</span>
      </div>
      <div class="notice-detail-content">
        <h1 id="noticeDetailTitle">${escapeHtml(notice.title)}</h1>
        <div class="notice-card-date">${lineIcon('calendar')}<time>${fmtDate(notice.date)}</time></div>
        <p class="notice-detail-body">${escapeHtml(notice.body)}</p>
      </div>
    </article>
  `;
}

function openNoticeDetail(noticeId, trigger) {
  const notice = state.notices.find(item => item.id === noticeId);
  if (!notice) {
    toast('This notice is no longer available.', 'error');
    return;
  }

  noticeDetailReturnFocus = trigger;
  noticeDetailPreviousOverflow = document.body.style.overflow;
  renderNoticeDetail(notice);
  $('#noticeDetail').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('[data-close-notice-detail]', $('#noticeDetail')).focus();
}

function closeNoticeDetail() {
  const detail = $('#noticeDetail');
  if (detail.classList.contains('hidden')) return;
  detail.classList.add('hidden');
  detail.removeAttribute('data-notice-id');
  $('#noticeDetailContent').innerHTML = '';
  document.body.style.overflow = noticeDetailPreviousOverflow;
  if (noticeDetailReturnFocus?.isConnected) noticeDetailReturnFocus.focus();
  noticeDetailReturnFocus = null;
}

/* ---------- COMPLAINTS ---------- */
function renderComplaintsPage() {
  $('#complaintResult').innerHTML = '';
  const signedIn = Boolean(currentUser && currentUser.emailVerified);
  $('#supportAuthRequired').classList.toggle('hidden', signedIn);
  $('#supportWorkspace').classList.toggle('hidden', !signedIn);
  if (!isFirebaseConfigured || !signedIn) {
    stopSupportListeners();
    if (!isFirebaseConfigured) {
      $('#supportAuthRequired h3').textContent = 'Private support is not configured yet';
      $('#supportAuthRequired p').textContent = 'Set your Firebase web app values and deploy firestore.rules to enable verified accounts and private conversations.';
    } else {
      $('#supportAuthRequired h3').textContent = 'Sign in to contact the FSU';
      $('#supportAuthRequired p').textContent = 'A verified student account gives you a private inbox and a unique student ID.';
    }
    return;
  }
  const studentId = studentIdFor(currentUser);
  $('#supportStudentId').textContent = studentId;
  watchSupportRequests(false);
}

function studentIdFor(user) {
  return `FSU-${user.uid}`;
}

function updateAuthUi() {
  document.body.classList.toggle('student-access-pending', Boolean(currentUser && !hasCampusAccess()));
  const link = $('#authNav');
  const accountName = currentUser?.displayName?.trim() || currentUser?.email?.split('@')[0] || 'My account';
  const hasAccountAccess = hasCampusAccess();
  link.classList.toggle('has-account', hasAccountAccess);
  $('#authNavLabel').textContent = hasAccountAccess ? accountName : currentUser ? 'Verify ID' : 'Log in';
  link.setAttribute('aria-label', hasAccountAccess
    ? `My account, ${accountName}`
    : currentUser ? 'Verify student ID' : 'Log in');
  $('#createAccountCta').classList.toggle('hidden', Boolean(currentUser));
  $('.main-nav [data-page="admin"]').classList.toggle('hidden', !isAdminUser);
}

function renderAuthPage() {
  const signedIn = Boolean(currentUser);
  $('#accountSignedOut').classList.toggle('hidden', signedIn);
  $('#accountSignedIn').classList.toggle('hidden', !signedIn);
  $('#authSetupNotice').classList.toggle('hidden', isFirebaseConfigured);
  if (!isFirebaseConfigured) {
    $('#authSetupNotice').textContent = 'Connect Firebase to enable verified email accounts and private messages. Add your Firebase web app values to firebase-client.js, then restart the app.';
  }
  if (signedIn) {
    $('#accountEmail').textContent = currentUser.email || '';
    $('#studentId').textContent = studentIdFor(currentUser);
    $('#accountRoleEyebrow').textContent = isAdminUser ? 'FSU ADMIN ACCOUNT' : 'YOUR STUDENT ACCOUNT';
    const approved = hasCampusAccess();
    $('#accountHeading').textContent = isAdminUser ? 'Admin signed in' : approved ? "You're signed in" : 'Campus verification required';
    $('#accountPrimaryAction').textContent = isAdminUser ? 'Open admin dashboard' : 'Open my inbox';
    $('#accountPrimaryAction').dataset.page = isAdminUser ? 'admin' : 'complaints';
    $('#accountPrimaryAction').classList.toggle('hidden', !approved);
    $('#student-id-card')?.classList.toggle('hidden', !approved);
    $('#studentVerificationPanel').classList.toggle('hidden', approved || isAdminUser);
    $('#accountVerificationNotice').className = `alert ${approved || isAdminUser ? 'alert-success' : 'alert-info'}`;
    $('#accountVerificationNotice').textContent = isAdminUser
      ? 'Authorized FSU administrator account.'
      : approved
        ? 'Your campus student ID has been verified. Portal access is enabled.'
        : studentVerification?.status === 'pending'
          ? 'Your student ID is under review. Portal features will unlock after an FSU admin approves it.'
          : studentVerification?.status === 'rejected'
            ? 'Your student ID could not be verified. Contact the FSU office to resolve this before submitting another request.'
            : 'Submit your campus student ID for FSU admin review. Portal access remains locked until it is approved.';
    $('#studentVerificationHeading').textContent = studentVerification?.status === 'rejected'
      ? 'Verification needs attention'
      : 'Verify your student account';
    $('#studentVerificationDescription').textContent = studentVerification?.status === 'pending'
      ? `Student ID ${studentVerification.studentId} was received. An FSU admin will check it against campus records.`
      : studentVerification?.status === 'rejected'
        ? 'The submitted ID could not be matched to campus records. Check it and submit the corrected ID for review.'
        : 'Enter the student ID issued by your campus. An FSU admin will check it before portal access is enabled.';
    $('#studentVerificationForm').classList.toggle('hidden', studentVerification?.status === 'pending');
    $('#campusStudentId').value = studentVerification?.status === 'rejected'
      ? studentVerification.studentId || ''
      : '';
    $('#accountAccessNotice').textContent = authNotice;
    $('#accountAccessNotice').classList.toggle('hidden', !authNotice);
    return;
  }
  $('#authHeading').textContent = isRegisterMode ? 'Create your student account' : 'Sign in';
  $('#authNameField').classList.toggle('hidden', !isRegisterMode);
  $('#authName').required = isRegisterMode;
  $('#authPassword').autocomplete = isRegisterMode ? 'new-password' : 'current-password';
  $('#authPassword').minLength = isRegisterMode ? 8 : 1;
  if (isRegisterMode) {
    $('#authPassword').pattern = '(?=.*[A-Za-z])(?=.*[0-9]).{8,}';
    $('#authPassword').title = 'Use at least 8 characters, including a letter and a number.';
    $('#authPassword').placeholder = 'At least 8 characters, with a letter and a number';
  } else {
    $('#authPassword').removeAttribute('pattern');
    $('#authPassword').removeAttribute('title');
    $('#authPassword').placeholder = 'Password';
  }
  $('#authSubmit').textContent = isRegisterMode ? 'Create account' : 'Sign in';
  $('#authModeToggle').textContent = isRegisterMode ? 'Already have an account? Sign in' : 'Create a student account';
  $('#resetPassword').classList.toggle('hidden', isRegisterMode);
  $('#authForm').querySelectorAll('input,button').forEach(input => { input.disabled = !isFirebaseConfigured; });
  $('#authModeToggle').disabled = !isFirebaseConfigured;
  $('#resetPassword').disabled = !isFirebaseConfigured;
  $('#authResult').innerHTML = authNotice
    ? `<div class="alert alert-info">${escapeHtml(authNotice)}</div>`
    : '';
}

function initAuth() {
  updateAuthUi();
  if (!isFirebaseConfigured) {
    renderAuthPage();
    return;
  }
  onAuthStateChanged(auth, async user => {
    if (verificationUnsubscribe) verificationUnsubscribe();
    verificationUnsubscribe = null;
    stopSupportListeners();
    stopAdminNotifications();
    stopParticipationSubscriptions();
    if (!user) {
      currentUser = null;
      isAdminUser = false;
      studentVerification = null;
      updateAuthUi();
      if ($('.page.active') && RESTRICTED_PAGES.has($('.page.active').id.replace('page-', ''))) navigate('login');
      renderAuthPage();
      if ($('#page-complaints').classList.contains('active')) renderComplaintsPage();
      if ($('#page-admin').classList.contains('active')) renderAdmin();
      return;
    }
    if (!user.emailVerified) {
      currentUser = null;
      isAdminUser = false;
      studentVerification = null;
      authNotice = 'Verify your email address, then sign in to submit your campus student ID for review.';
      updateAuthUi();
      await signOut(auth);
      return;
    }
    currentUser = user;
    isAdminUser = false;
    studentVerification = null;
    authNotice = '';
    try {
      const adminProfile = await getDoc(doc(db, 'admins', user.uid));
      if (auth.currentUser?.uid !== user.uid) return;
      isAdminUser = adminProfile.data()?.role === 'admin';
      if (isAdminUser) {
        studentVerification = { status: 'approved' };
        if (portalContentLoaded && !portalContentExists) queuePublicContentWrite();
      } else {
        const verificationRecord = await getDoc(doc(db, 'studentVerifications', user.uid));
        if (auth.currentUser?.uid !== user.uid) return;
        studentVerification = verificationRecord.exists() ? verificationRecord.data() : null;
        verificationUnsubscribe = onSnapshot(
          doc(db, 'studentVerifications', user.uid),
          snapshot => {
            if (auth.currentUser?.uid !== user.uid) return;
            studentVerification = snapshot.exists() ? snapshot.data() : null;
            watchStudentParticipation();
            updateAuthUi();
            renderAuthPage();
            if ($('#page-complaints').classList.contains('active')) renderComplaintsPage();
            if ($('#page-admin').classList.contains('active')) renderAdmin();
            if ($('#page-events').classList.contains('active')) renderEvents();
            if ($('#page-lostfound').classList.contains('active')) renderLostFound();
          },
          error => {
            if (auth.currentUser?.uid !== user.uid) return;
            authNotice = `Student verification status could not be refreshed: ${firebaseErrorMessage(error)}`;
            renderAuthPage();
          },
        );
      }
    } catch (error) {
      if (auth.currentUser?.uid !== user.uid) return;
      isAdminUser = false;
      studentVerification = null;
      authNotice = error.code === 'permission-denied'
        ? 'Firebase denied the account verification check. Publish the latest firestore.rules, then refresh.'
        : `Account verification could not be checked: ${firebaseErrorMessage(error)}`;
    }
    if (auth.currentUser?.uid !== user.uid) return;
    watchStudentParticipation();
    updateAuthUi();
    renderAuthPage();
    if ($('#page-complaints').classList.contains('active')) renderComplaintsPage();
    if ($('#page-admin').classList.contains('active')) renderAdmin();
  });
}

function firebaseErrorMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 8 characters, including a letter and a number.',
    'auth/too-many-requests': 'Too many attempts. Wait a bit and try again.',
    'auth/network-request-failed': 'Could not reach Firebase. Check your internet connection.',
    'auth/user-not-found': 'No account was found for this email.',
    'permission-denied': 'Firestore denied access. Publish firestore.rules to the Firebase project configured in firebase-client.js.',
    'storage/bucket-not-found': 'Firebase Storage bucket not found. Create the default bucket in Firebase Console → Storage, set its exact name as VITE_FIREBASE_STORAGE_BUCKET, and rebuild/redeploy the app.',
    'storage/unauthorized': `Firebase Storage denied this upload. Publish storage.rules to Firebase project ${firebaseProjectId}. Admin uploads require a verified account with admins/{UID}.role set to "admin"; Lost & Found uploads require an approved studentVerifications/{UID} record.`,
  };
  return messages[error?.code] || error?.message || 'Please try again.';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!isFirebaseConfigured) return;
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const result = $('#authResult');
  result.innerHTML = '';
  if (!isValidEmail(email)) {
    result.innerHTML = '<div class="alert alert-error">Enter a valid email address.</div>';
    $('#authEmail').focus();
    return;
  }
  if (isRegisterMode && !isValidSignupPassword(password)) {
    result.innerHTML = '<div class="alert alert-error">Password must be at least 8 characters and include at least one letter and one number.</div>';
    $('#authPassword').focus();
    return;
  }
  $('#authSubmit').disabled = true;
  try {
    if (isRegisterMode) {
      const name = $('#authName').value.trim();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await sendEmailVerification(credential.user);
      await signOut(auth);
      isRegisterMode = false;
      authNotice = 'Account created. Check your email and verify the address, then sign in and submit your campus student ID for review.';
      $('#authForm').reset();
      renderAuthPage();
      return;
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(auth);
      authNotice = 'Verify your email address before signing in. We sent a fresh verification link.';
      renderAuthPage();
    }
  } catch (error) {
    result.innerHTML = `<div class="alert alert-error">${escapeHtml(firebaseErrorMessage(error))}</div>`;
  } finally {
    $('#authSubmit').disabled = !isFirebaseConfigured;
  }
}

async function handlePasswordReset() {
  const email = $('#authEmail').value.trim();
  if (!isValidEmail(email)) {
    $('#authResult').innerHTML = '<div class="alert alert-warning">Enter a valid email address first.</div>';
    $('#authEmail').focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    $('#authResult').innerHTML = '<div class="alert alert-success">If an account exists for that email, a reset link has been sent.</div>';
  } catch (error) {
    $('#authResult').innerHTML = `<div class="alert alert-error">${escapeHtml(firebaseErrorMessage(error))}</div>`;
  }
}

async function handleStudentVerificationSubmit(event) {
  event.preventDefault();
  if (!currentUser?.emailVerified || studentVerification?.status === 'pending' || studentVerification?.status === 'approved') {
    toast('Sign in with a verified email before submitting a student ID.', 'error');
    return;
  }
  const studentId = $('#campusStudentId').value.trim();
  if (studentId.length < 3 || studentId.length > 64) {
    $('#studentVerificationResult').innerHTML = '<div class="alert alert-error">Enter a valid campus student ID (3–64 characters).</div>';
    $('#campusStudentId').focus();
    return;
  }
  const submit = $('#studentVerificationForm button[type="submit"]');
  submit.disabled = true;
  try {
    await setDoc(doc(db, 'studentVerifications', currentUser.uid), {
      email: currentUser.email,
      displayName: currentUser.displayName || '',
      studentId,
      status: 'pending',
      submittedAt: serverTimestamp(),
    }, { merge: true });
    studentVerification = {
      email: currentUser.email,
      displayName: currentUser.displayName || '',
      studentId,
      status: 'pending',
    };
    $('#studentVerificationResult').innerHTML = '';
    renderAuthPage();
    updateAuthUi();
    toast('Student ID submitted for review.', 'success');
  } catch (error) {
    $('#studentVerificationResult').innerHTML = `<div class="alert alert-error">Student ID could not be submitted: ${escapeHtml(firebaseErrorMessage(error))}</div>`;
    submit.disabled = false;
  }
}

function stopSupportListeners() {
  if (supportRequestUnsubscribe) supportRequestUnsubscribe();
  supportRequestUnsubscribe = null;
  supportMessageUnsubscribers.forEach(unsubscribe => unsubscribe());
  supportMessageUnsubscribers.clear();
  supportRequests = [];
  supportMessages = new Map();
  supportRequestsLoaded = false;
  supportRequestsError = '';
}

function stopAdminNotifications() {
  adminNotificationUnsubscribers.forEach(unsubscribe => unsubscribe());
  adminNotificationUnsubscribers = [];
  adminNotificationUserId = '';
  adminNotificationUnread = {
    complaints: false,
    verifications: false,
    notices: false,
  };
}

function adminNotificationStorageKey(section) {
  return `${ADMIN_NOTIFICATIONS_KEY}:${currentUser.uid}:${section}`;
}

function saveAdminNotificationItems(section, ids) {
  sessionStorage.setItem(adminNotificationStorageKey(section), JSON.stringify([...ids]));
}

function updateAdminSectionNotifications(section, ids) {
  if (!isAdmin() || (section === 'notices' && !portalContentLoaded)) return;
  const currentIds = new Set(ids);
  const storageKey = adminNotificationStorageKey(section);
  let savedIds = sessionStorage.getItem(storageKey);

  if (savedIds === null) {
    saveAdminNotificationItems(section, currentIds);
    adminNotificationUnread[section] = false;
  } else {
    const seenIds = new Set(JSON.parse(savedIds));
    const sectionIsOpen = $('#page-admin').classList.contains('active')
      && sessionStorage.getItem(ADMIN_TAB_KEY) === section;
    if (sectionIsOpen) {
      currentIds.forEach(id => seenIds.add(id));
      saveAdminNotificationItems(section, seenIds);
    }
    adminNotificationUnread[section] = !sectionIsOpen
      && [...currentIds].some(id => !seenIds.has(id));
  }
  updateAdminNotificationDots();
}

function updateAdminNotificationDots() {
  $$('.admin-tabs button[data-tab]').forEach(button => {
    const section = button.dataset.tab;
    const unread = Boolean(adminNotificationUnread[section]);
    const dot = $('.admin-notification-dot', button);
    if (dot) dot.classList.toggle('hidden', !unread);
    button.setAttribute('aria-label', `${tabLabel(section)}${unread ? ', new items' : ''}`);
  });
}

function startAdminNotifications() {
  if (!db || !isAdmin()) return;
  if (adminNotificationUserId === currentUser.uid) return;
  stopAdminNotifications();
  adminNotificationUserId = currentUser.uid;
  const complaints = onSnapshot(collection(db, 'supportRequests'), snapshot => {
    updateAdminSectionNotifications('complaints', snapshot.docs.map(item => item.id));
  }, error => {
    toast(`New complaints could not be checked: ${firebaseErrorMessage(error)}`, 'error');
  });
  const verifications = onSnapshot(query(
    collection(db, 'studentVerifications'),
    where('status', '==', 'pending'),
  ), snapshot => {
    updateAdminSectionNotifications('verifications', snapshot.docs.map(item => item.id));
  }, error => {
    toast(`New student verification requests could not be checked: ${firebaseErrorMessage(error)}`, 'error');
  });
  adminNotificationUnsubscribers.push(complaints, verifications);
}

function watchSupportRequests(adminMode, loadMessages = true) {
  stopSupportListeners();
  const requests = adminMode
    ? collection(db, 'supportRequests')
    : query(collection(db, 'supportRequests'), where('userId', '==', currentUser.uid));
  supportRequestUnsubscribe = onSnapshot(requests, snapshot => {
    supportRequests = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    supportRequestsLoaded = true;
    supportRequestsError = '';
    if (loadMessages) {
      const activeIds = new Set(supportRequests.map(item => item.id));
      supportMessageUnsubscribers.forEach((unsubscribe, id) => {
        if (!activeIds.has(id)) {
          unsubscribe();
          supportMessageUnsubscribers.delete(id);
          supportMessages.delete(id);
        }
      });
      supportRequests.forEach(item => {
        if (supportMessageUnsubscribers.has(item.id)) return;
        const messages = query(collection(db, 'supportRequests', item.id, 'messages'), orderBy('createdAt'));
        const unsubscribe = onSnapshot(messages, messageSnapshot => {
          supportMessages.set(item.id, messageSnapshot.docs.map(message => ({ id: message.id, ...message.data() })));
          renderSupportInbox(adminMode);
        }, error => {
          showSupportAccessError(adminMode, error);
        });
        supportMessageUnsubscribers.set(item.id, unsubscribe);
      });
      renderSupportInbox(adminMode);
    } else if ($('#page-admin').classList.contains('active')
      && (sessionStorage.getItem(ADMIN_TAB_KEY) || 'overview') === 'overview') {
      $('#adminContent').innerHTML = adminOverview();
    }
  }, error => {
    if (!loadMessages && adminMode) {
      supportRequestsLoaded = true;
      supportRequestsError = firebaseErrorMessage(error);
      if ($('#page-admin').classList.contains('active')
        && (sessionStorage.getItem(ADMIN_TAB_KEY) || 'overview') === 'overview') {
        $('#adminContent').innerHTML = adminOverview();
      }
    } else {
      showSupportAccessError(adminMode, error);
    }
  });
}

function showSupportAccessError(adminMode, error) {
  const target = adminMode ? $('#firebaseAdminInbox') : $('#supportThreads');
  if (target) {
    target.innerHTML = `<div class="alert alert-error">Could not load private messages. ${escapeHtml(firebaseErrorMessage(error))}</div>`;
  }
}

function formatCloudDate(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== 'function') return 'Just now';
  return fmtDateTime(timestamp.toDate().toISOString());
}

function renderSupportInbox(adminMode) {
  const target = adminMode ? $('#firebaseAdminInbox') : $('#supportThreads');
  if (!target) return;
  if (!supportRequests.length) {
    target.innerHTML = '<div class="empty">No conversations yet. Send the FSU a message to get started.</div>';
    return;
  }
  target.innerHTML = supportRequests.map(item => {
    const messages = supportMessages.get(item.id) || [];
    const conversation = [
      `<article class="message-bubble message-student"><div class="between"><strong>Student</strong><time>${formatCloudDate(item.createdAt)}</time></div><p>${escapeHtml(item.summary)}</p></article>`,
      ...messages.map(message => `
        <article class="message-bubble ${message.senderRole === 'admin' ? 'message-admin' : 'message-student'}">
          <div class="between"><strong>${message.senderRole === 'admin' ? 'FSU team' : 'Student'}</strong><time>${formatCloudDate(message.createdAt)}</time></div>
          <p>${escapeHtml(message.body)}</p>
        </article>
      `),
    ].join('');
    return `
      <article class="support-thread">
        <div class="between support-thread-heading">
          <div><span class="tag">${escapeHtml(item.category)}</span>
            <span class="badge status-${statusClass(item.status)}">${escapeHtml(item.status)}</span>
            ${adminMode ? `<span class="muted small">${escapeHtml(item.studentId)} · ${escapeHtml(item.userId)}</span>` : ''}
          </div>
          <time class="muted small">${formatCloudDate(item.createdAt)}</time>
        </div>
        ${conversation}
        ${adminMode ? `
          <div class="support-admin-tools">
            <label class="small">Status
              <select data-cloud-status="${escapeAttr(item.id)}">
                ${['Received','In progress','Solved'].map(status => `<option ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}
              </select>
            </label>
            <label class="small">Assigned to
              <input data-assignee="${escapeAttr(item.id)}" value="${escapeAttr(item.assignedTo || '')}" placeholder="FSU team member">
            </label>
            <button class="btn btn-outline btn-sm" data-save-assignee="${escapeAttr(item.id)}">Save assignment</button>
          </div>
        ` : ''}
        <form class="support-reply-form" data-support-reply="${escapeAttr(item.id)}">
          <label class="sr-only" for="reply-${escapeAttr(item.id)}">Reply to this conversation</label>
          <textarea id="reply-${escapeAttr(item.id)}" name="reply" rows="2" maxlength="4000" required placeholder="${adminMode ? 'Write a private reply to this student...' : 'Reply privately to the FSU team...'}"></textarea>
          <button class="btn btn-primary btn-sm" type="submit">Send reply</button>
        </form>
      </article>
    `;
  }).join('');
}

async function handlePrivateMessage(event) {
  event.preventDefault();
  if (!currentUser || !currentUser.emailVerified) {
    navigate('login');
    return;
  }
  const message = $('#cMessage').value.trim();
  const result = $('#complaintResult');
  if (!message) {
    result.innerHTML = '<div class="alert alert-error">Write a message before sending.</div>';
    return;
  }
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await addDoc(collection(db, 'supportRequests'), {
      userId: currentUser.uid,
      studentId: studentIdFor(currentUser),
      category: $('#cCategory').value,
      summary: message,
      status: 'Received',
      createdAt: serverTimestamp(),
    });
    event.currentTarget.reset();
    result.innerHTML = '<div class="alert alert-success">Your private message was sent to the FSU. Replies will appear in your inbox.</div>';
  } catch (error) {
    result.innerHTML = `<div class="alert alert-error">Message could not be sent: ${escapeHtml(firebaseErrorMessage(error))}</div>`;
  } finally {
    button.disabled = false;
  }
}

async function handlePrivateReply(event) {
  event.preventDefault();
  const form = event.target.closest('[data-support-reply]');
  const item = supportRequests.find(request => request.id === form?.dataset.supportReply);
  const body = form?.elements.reply.value.trim();
  if (!form || !item || !body || !currentUser) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await addDoc(collection(db, 'supportRequests', item.id, 'messages'), {
      senderId: currentUser.uid,
      senderRole: isAdminUser ? 'admin' : 'student',
      body,
      createdAt: serverTimestamp(),
    });
    if (isAdminUser && item.status === 'Received') {
      await updateDoc(doc(db, 'supportRequests', item.id), {
        status: 'In progress',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    toast(`Reply could not be sent: ${firebaseErrorMessage(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

/* ---------- EVENTS ---------- */
function renderEvents() {
  const list = $('#eventList');
  const upcoming = state.events.filter(ev => !ev.date || ev.date >= dateAfter(0));
  if (!upcoming.length) {
    list.innerHTML = `<div class="empty">No events yet. Check back soon!</div>`;
    return;
  }

  list.innerHTML = upcoming.sort((a, b) => a.date.localeCompare(b.date)).map(ev => {
    const registered = !isAdminUser && state.eventRegs.includes(ev.id);
    const count = ev.registrationCount ?? ev.registrations.length;
    return `
      <article class="card">
        ${ev.image ? `<img class="event-card-image" src="${escapeAttr(ev.image)}" alt="${escapeAttr(ev.title)}" loading="lazy">` : ''}
        <div class="card-head">
          <h3 class="card-title">${escapeHtml(ev.title)}</h3>
          <span class="badge badge-event">Event</span>
        </div>
        <div class="card-meta">
          <span>${lineIcon('calendar')} ${escapeHtml(ev.date)} ${ev.time ? '· ' + escapeHtml(ev.time) : ''}</span>
          <span>${lineIcon('location')} ${escapeHtml(ev.location || '—')}</span>
          <span>${lineIcon('users')} ${count} registered</span>
        </div>
        <p class="card-body">${escapeHtml(ev.description || '')}</p>
        <div class="card-actions">
        <button class="btn btn-outline" data-calendar="${ev.id}">${lineIcon('calendarPlus')} Add calendar reminder</button>
        ${hasCampusAccess() && !isAdminUser
          ? `<button class="btn ${registered ? 'btn-outline' : 'btn-primary'}" data-register="${escapeAttr(ev.id)}" ${registered ? 'disabled' : ''}>${registered ? `${lineIcon('check')} Registered` : 'Register'}</button>`
          : '<button class="btn btn-primary" data-page="login">Sign in to register</button>'}
        </div>
        ${ev.feedbackPoll?.enabled ? renderEventFeedback(ev) : ''}
      </article>
    `;
  }).join('');
}

function renderEventFeedback(event) {
  const poll = event.feedbackPoll;
  const responses = Array.isArray(poll.responses) ? poll.responses : [];
  const ownResponse = responses.find(response => response.userId === currentUser?.uid);
  const question = poll.question || `Should we organize ${event.title}?`;
  if (!hasCampusAccess() && !isAdminUser) {
    return `<section class="event-feedback event-feedback-locked">
      <p class="eyebrow">CAMPUS STUDENT FEEDBACK</p>
      <p class="muted small">Sign in with a verified email and admin-approved student ID to share your view.</p>
      <button class="text-link" type="button" data-page="login">Sign in or verify your student ID →</button>
    </section>`;
  }
  if (isAdminUser) return renderEventFeedbackResults(responses, question);
  if (ownResponse) {
    return `<section class="event-feedback" aria-label="Event feedback results">
      <p class="eyebrow">STUDENT FEEDBACK</p>
      <h4>${escapeHtml(question)}</h4>
      <p class="muted small">Thanks for sharing your view. ${poll.feedbackCount || 0} student${poll.feedbackCount === 1 ? '' : 's'} responded.</p>
    </section>`;
  }

  return `<form class="event-feedback form" data-event-feedback="${escapeAttr(event.id)}">
    <p class="eyebrow">HELP US DECIDE</p>
    <fieldset class="feedback-fieldset">
      <legend>${escapeHtml(question)}</legend>
      <div class="feedback-options">
        ${EVENT_FEEDBACK_CHOICES.map(choice => `
          <label class="feedback-choice">
            <input type="radio" name="event-choice-${escapeAttr(event.id)}" value="${choice}" required>
            <span>${choice}</span>
          </label>
        `).join('')}
      </div>
    </fieldset>
    <label class="field feedback-suggestion" for="feedback-${escapeAttr(event.id)}">
      <span>Suggestion <span class="muted">(optional)</span></span>
      <textarea id="feedback-${escapeAttr(event.id)}" name="suggestion" rows="2" maxlength="1000" placeholder="What would make this event better?"></textarea>
    </label>
    <button class="btn btn-outline btn-sm" type="submit">Send feedback</button>
  </form>`;
}

function renderEventFeedbackResults(responses, question) {
  const results = EVENT_FEEDBACK_CHOICES.map(choice => {
    const votes = responses.filter(response => response.choice === choice).length;
    const percent = responses.length ? Math.round(votes / responses.length * 100) : 0;
    return `<div class="feedback-result">
      <div class="between"><span>${choice}</span><span class="muted small">${votes} · ${percent}%</span></div>
      <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
    </div>`;
  }).join('');
  return `<section class="event-feedback" aria-label="Event feedback results">
    <p class="eyebrow">STUDENT FEEDBACK</p>
    <h4>${escapeHtml(question)}</h4>
    <p class="muted small">${responses.length} student${responses.length === 1 ? '' : 's'} responded.</p>
    ${results}
  </section>`;
}

/* ---------- OPPORTUNITIES ---------- */
function renderOpportunities() {
  const list = $('#opportunityList');
  const opportunities = state.opportunities.filter(o => o.approved !== false);
  if (!opportunities.length) {
    list.innerHTML = `<div class="empty">No opportunities listed yet.</div>`;
    return;
  }
  list.innerHTML = opportunities.map(o => `
    <article class="card">
      <div class="card-head">
        <h3 class="card-title">${escapeHtml(o.title)}</h3>
        <span class="tag">${escapeHtml(o.type)}</span>
      </div>
      <div class="card-meta">
        <span>${lineIcon('building')} ${escapeHtml(o.org || '—')}</span>
        <span>${lineIcon('clock')} Deadline: ${escapeHtml(o.deadline || '—')}</span>
      </div>
      <p class="card-body">${escapeHtml(o.description || '')}</p>
      <div class="card-actions">
        <a class="btn btn-outline" href="${escapeAttr(safeExternalUrl(o.link))}" target="_blank" rel="noopener">Learn more →</a>
      </div>
    </article>
  `).join('');
}

/* ---------- LOST & FOUND ---------- */
function renderLostFound() {
  const canPost = hasCampusAccess() && !isAdminUser;
  $('#lostFoundForm').classList.toggle('hidden', !canPost);
  $('#lostFoundAccessNotice')?.classList.toggle('hidden', canPost);
  const list = $('#lostFoundList');
  const items = state.lostfound
    .filter(i => i.approved !== false)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!items.length) {
    list.innerHTML = `<div class="empty">Nothing posted yet. Be the first!</div>`;
    return;
  }

  list.innerHTML = items.map(i => `
    <article class="card ${i.type === 'lost' ? 'lf-lost' : 'lf-found'}">
      ${i.photo ? `<img class="lost-found-photo" src="${escapeAttr(i.photo)}" alt="${escapeAttr(i.type === 'lost' ? 'Photo of lost item: ' : 'Photo of found item: ')}${escapeAttr(i.title)}" loading="lazy">` : ''}
      <div class="card-head">
        <h3 class="card-title">${escapeHtml(i.title)}</h3>
        <span class="badge ${i.type === 'lost' ? 'badge-event' : 'badge-scholarship'}">
          ${i.type === 'lost' ? 'Lost' : 'Found'}
        </span>
      </div>
      <div class="card-meta">
        <span>${lineIcon('location')} ${escapeHtml(i.location || '—')}</span>
        <span>${lineIcon('calendar')} ${fmtDate(i.date)}</span>
      </div>
      ${i.description ? `<p class="card-body">${escapeHtml(i.description)}</p>` : ''}
      <div class="card-meta mt-1">
        <span>${lineIcon('phone')} Contact: ${escapeHtml(i.contact || '—')}</span>
      </div>
    </article>
  `).join('');
}

/* ---------- GALLERY ---------- */
function renderGallery() {
  const list = $('#galleryList');
  list.innerHTML = state.gallery.map(g => `
    <figure class="gallery-item">
      <img src="${escapeAttr(g.image)}" alt="${escapeAttr(g.caption)}" loading="lazy">
      <figcaption class="gallery-caption">${escapeHtml(g.caption)}</figcaption>
    </figure>
  `).join('');
}

function adminGallery() {
  return `
    <div class="grid grid-2 admin-gallery-layout">
      <form id="adminGalleryForm" class="card form">
        <h3>Add a gallery photo</h3>
        <div class="field">
          <label for="agCaption">Caption</label>
          <input id="agCaption" maxlength="120" required placeholder="Event or photo caption">
        </div>
        <div class="field">
          <label for="agImage">Image</label>
          <input id="agImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required>
          <span class="muted small">JPEG, PNG, WebP, or GIF; up to 1.5 MB.</span>
        </div>
        <button class="btn btn-primary" type="submit">Add to gallery</button>
      </form>
      <div class="card">
        <h3>Gallery photos (${state.gallery.length})</h3>
        <div class="grid gallery-grid admin-gallery-grid">
          ${state.gallery.map(item => `
            <figure class="gallery-item">
              <img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.caption)}" loading="lazy">
              <figcaption class="gallery-caption">
                <span>${escapeHtml(item.caption)}</span>
                <button class="btn btn-danger btn-sm" type="button" data-delete-gallery="${escapeAttr(item.id)}">Delete</button>
              </figcaption>
            </figure>
          `).join('') || '<p class="muted small">No gallery photos yet.</p>'}
        </div>
      </div>
    </div>
  `;
}

function bindAdminGallery() {
  $('#adminGalleryForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!requireAdminAction()) return;

    const file = $('#agImage').files?.[0];
    if (!file) {
      toast('Choose an image to add to the gallery.', 'error');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast('Choose a JPEG, PNG, WebP, or GIF image.', 'error');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast('The image must be 1.5 MB or smaller.', 'error');
      return;
    }

    if (!storage) {
      toast('Firebase Storage is not configured for gallery uploads.', 'error');
      return;
    }

    const submit = $('#adminGalleryForm button[type="submit"]');
    const id = uid('g');
    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }[file.type];
    const storagePath = `gallery/${id}.${extension}`;
    submit.disabled = true;
    let contentSaved = false;
    try {
      await uploadBytes(ref(storage, storagePath), file, { contentType: file.type });
      const image = await getDownloadURL(ref(storage, storagePath));
      const item = {
        id,
        caption: $('#agCaption').value.trim(),
        image,
        storagePath,
      };
      state.gallery.unshift(item);
      cacheStateLocally();
      await persistPublicContentNow();
      contentSaved = true;
      renderAdminTab('gallery');
      renderGallery();
      toast('Photo added to the gallery', 'success');
    } catch (error) {
      if (!contentSaved) {
        state.gallery = state.gallery.filter(item => item.id !== id);
        cacheStateLocally();
        try {
          await deleteObject(ref(storage, storagePath));
        } catch (cleanupError) {
          toast(`Failed upload cleanup: ${firebaseErrorMessage(cleanupError)}`, 'error');
        }
      }
      toast(firebaseErrorMessage(error), 'error');
    } finally {
      submit.disabled = false;
    }
  });

  $$('button[data-delete-gallery]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!requireAdminAction()) return;
      const id = button.dataset.deleteGallery;
      const index = state.gallery.findIndex(item => item.id === id);
      if (index < 0) return;
      const [removed] = state.gallery.splice(index, 1);
      button.disabled = true;
      cacheStateLocally();
      try {
        await persistPublicContentNow();
      } catch {
        state.gallery.splice(index, 0, removed);
        cacheStateLocally();
        button.disabled = false;
        return;
      }
      if (storage && removed.storagePath) {
        try {
          await deleteObject(ref(storage, removed.storagePath));
        } catch (error) {
          toast(`Gallery image could not be removed from storage: ${firebaseErrorMessage(error)}`, 'error');
        }
      }
      renderAdminTab('gallery');
      renderGallery();
      toast('Gallery photo deleted', 'success');
    });
  });
}

/* ---------- TEAM ---------- */
function renderTeam() {
  const list = $('#teamList');
  list.innerHTML = state.team.map(t => `
    <div class="card">
      <h3 class="card-title">${escapeHtml(t.name)}</h3>
      <p class="muted small">${escapeHtml(t.role)}</p>
      <div class="card-actions">
        <button class="btn btn-outline btn-sm" data-contact="${escapeAttr(t.name)}">
          Contact
        </button>
      </div>
    </div>
  `).join('');
}

/* ============================================================
   ADMIN
   ============================================================ */
function isAdmin() {
  return Boolean(currentUser && isAdminUser);
}

function requireAdminAction() {
  if (isAdmin()) return true;
  toast('Only an authorized FSU admin can do that.', 'error');
  return false;
}

function renderAdmin() {
  const area = $('#adminArea');
  if (!isFirebaseConfigured) {
    area.innerHTML = `
      <div class="card login-card">
        <h2 class="page-title">Admin dashboard unavailable</h2>
        <p class="muted small">Configure Firebase and deploy the Firestore rules before using the admin inbox.</p>
      </div>
    `;
    return;
  }
  if (!isAdmin()) {
    stopAdminNotifications();
    area.innerHTML = `
      <div class="card login-card">
        <h2 class="page-title">FSU admin access</h2>
        <p class="muted small">${currentUser
          ? 'This verified account is not on the FSU admin allowlist. Ask an administrator to add its Firebase UID to the admins collection.'
          : 'Sign in with your verified FSU admin email and password to open the admin dashboard.'}</p>
        <div class="card-actions">
          <button class="btn btn-primary" data-page="login">${currentUser ? 'View student ID' : 'Sign in'}</button>
        </div>
      </div>
    `;
    return;
  }

  startAdminNotifications();
  updateAdminSectionNotifications('notices', state.notices.map(notice => notice.id));
  const tabs = ['overview','complaints','verifications','notices','events','lostfound','gallery'];
  const savedTab = sessionStorage.getItem(ADMIN_TAB_KEY);
  const activeTab = tabs.includes(savedTab) ? savedTab : 'overview';

  area.innerHTML = `
    <div class="between mb-1">
      <h2 class="page-title">Admin dashboard</h2>
      <div class="card-actions"><span class="muted small">${escapeHtml(currentUser.email)}</span><button class="btn btn-outline btn-sm" id="adminLogout">Sign out</button></div>
    </div>

    <div class="admin-tabs">
      ${tabs
        .map(t => `
          <button data-tab="${t}" class="${t === activeTab ? 'active' : ''}">
            <span>${tabLabel(t)}</span>
            <span class="admin-notification-dot hidden" aria-hidden="true"></span>
          </button>
        `).join('')}
    </div>

    <div id="adminContent"></div>
  `;

  $$('.admin-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem(ADMIN_TAB_KEY, btn.dataset.tab);
      renderAdmin();
    });
  });

  $('#adminLogout').addEventListener('click', () => {
    signOut(auth);
  });

  renderAdminTab(activeTab);
}

function tabLabel(t) {
  return {
    overview: 'Overview',
    complaints: 'Complaints',
    verifications: 'Student verification',
    notices: 'Notices',
    events: 'Events',
    lostfound: 'Lost & Found',
    gallery: 'Gallery',
  }[t] || t;
}

function renderAdminTab(tab) {
  if (!requireAdminAction()) {
    renderAdmin();
    return;
  }
  if (tab !== 'complaints') stopSupportListeners();
  const c = $('#adminContent');
  if (tab === 'overview')   { c.innerHTML = adminOverview(); watchSupportRequests(true, false); }
  if (tab === 'complaints')  { c.innerHTML = adminComplaints(); bindAdminComplaints(); watchSupportRequests(true); }
  if (tab === 'verifications') { c.innerHTML = adminVerifications(); loadVerificationRequests(c); }
  if (tab === 'notices')     { c.innerHTML = adminNotices();    bindAdminNotices(); }
  if (tab === 'events') {
    c.innerHTML = adminEvents();
    bindAdminEvents();
    loadAdminEventParticipation();
  }
  if (tab === 'lostfound') {
    c.innerHTML = adminLostFound();
    bindAdminLostFound();
    loadAdminLostFound().then(() => {
      if (!isAdminUser || !$('#page-admin').classList.contains('active')
        || sessionStorage.getItem(ADMIN_TAB_KEY) !== 'lostfound') return;
      const content = $('#adminContent');
      content.innerHTML = adminLostFound();
      bindAdminLostFound();
    });
  }
  if (tab === 'gallery')     { c.innerHTML = adminGallery(); bindAdminGallery(); }
}

function adminVerifications() {
  return `
    <section class="card support-admin-inbox">
      <p class="eyebrow">CAMPUS MEMBERSHIP</p>
      <h3>Student ID verification</h3>
      <p class="muted small">Check each submitted student ID against official campus records before approving portal access.</p>
      <div id="verificationQueue"><div class="empty">Loading verification requests...</div></div>
    </section>
  `;
}

async function loadVerificationRequests(container) {
  const queue = $('#verificationQueue', container);
  try {
    const snapshot = await getDocs(query(
      collection(db, 'studentVerifications'),
      where('status', '==', 'pending'),
    ));
    if (!isAdmin() || !queue?.isConnected) return;
    const requests = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    queue.innerHTML = requests.length ? requests.map(request => `
      <article class="verification-request">
        <div>
          <h4>${escapeHtml(request.displayName || 'Student')}</h4>
          <p><strong>Student ID:</strong> ${escapeHtml(request.studentId)}</p>
          <p class="muted small">${escapeHtml(request.email)} · Submitted ${formatCloudDate(request.submittedAt)}</p>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" data-approve-student="${escapeAttr(request.id)}">Approve</button>
          <button class="btn btn-outline btn-sm" data-reject-student="${escapeAttr(request.id)}">Reject</button>
        </div>
      </article>
    `).join('') : '<div class="empty">No student IDs are awaiting review.</div>';
    queue.querySelectorAll('[data-approve-student], [data-reject-student]').forEach(button => {
      button.addEventListener('click', async () => {
        if (!requireAdminAction()) return;
        const uid = button.dataset.approveStudent || button.dataset.rejectStudent;
        const status = button.hasAttribute('data-approve-student') ? 'approved' : 'rejected';
        button.disabled = true;
        try {
          await updateDoc(doc(db, 'studentVerifications', uid), {
            status,
            reviewedAt: serverTimestamp(),
            reviewedBy: currentUser.uid,
          });
          toast(status === 'approved' ? 'Student access approved' : 'Student verification rejected', 'success');
          await loadVerificationRequests(container);
        } catch (error) {
          button.disabled = false;
          toast(`Verification could not be updated: ${firebaseErrorMessage(error)}`, 'error');
        }
      });
    });
  } catch (error) {
    if (!queue?.isConnected) return;
    const detail = error.code === 'permission-denied'
      ? `Publish firestore.rules to Firebase project ${firebaseProjectId}. Confirm this verified admin's Firebase Auth UID has an admins/{UID} document with role: "admin".`
      : firebaseErrorMessage(error);
    queue.innerHTML = `<div class="alert alert-error">Verification requests could not be loaded: ${escapeHtml(detail)}</div>`;
  }
}

function adminOverview() {
  const total = supportRequests.length;
  const solved = supportRequests.filter(c => c.status === 'Solved').length;
  const inprog = supportRequests.filter(c => c.status === 'In progress').length;
  const received = supportRequests.filter(c => c.status === 'Received').length;
  const regs = state.events.reduce((s, e) => s + e.registrations.length, 0);
  const recentRequests = supportRequests.slice(0, 5);

  return `
    <div class="stats">
      <div class="stat"><div class="stat-value">${supportRequestsLoaded ? total : '…'}</div><div class="stat-label">Support conversations</div></div>
      <div class="stat"><div class="stat-value">${supportRequestsLoaded ? solved : '…'}</div><div class="stat-label">Solved</div></div>
      <div class="stat"><div class="stat-value">${supportRequestsLoaded ? inprog : '…'}</div><div class="stat-label">In progress</div></div>
      <div class="stat"><div class="stat-value">${supportRequestsLoaded ? received : '…'}</div><div class="stat-label">Received</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h3>Event sign-ups</h3>
        ${state.events.length ? state.events.map(e => `
          <div class="between" style="padding:.35rem 0;border-bottom:1px solid var(--border)">
            <span>${escapeHtml(e.title)}</span>
            <strong>${e.registrations.length}</strong>
          </div>
        `).join('') : '<p class="muted small">No events yet.</p>'}
        <p class="muted small mt-1">Total registrations: <strong>${regs}</strong></p>
      </div>
      <div class="card">
        <h3>Recent support conversations</h3>
        ${supportRequestsError ? `<p class="alert alert-error">${escapeHtml(supportRequestsError)}</p>` : ''}
        ${!supportRequestsLoaded ? '<p class="muted small">Loading support activity...</p>' : recentRequests.length ? recentRequests.map(c => `
          <div style="padding:.35rem 0;border-bottom:1px solid var(--border)">
            <div class="between">
              <span class="small">${escapeHtml(c.category)}</span>
              <span class="badge status-${statusClass(c.status)}">${escapeHtml(c.status)}</span>
            </div>
            <div class="muted small">${escapeHtml(c.studentId || 'Student')} · ${formatCloudDate(c.createdAt)}</div>
          </div>
        `).join('') : '<p class="muted small">No support conversations yet.</p>'}
      </div>
    </div>
  `;
}

function adminComplaints() {
  return `
    <section class="card support-admin-inbox">
      <p class="eyebrow">PRIVATE STUDENT CONVERSATIONS</p>
      <h3>Help &amp; guidance inbox</h3>
      <p class="muted small">Replies sent here are visible only to the student who opened each conversation.</p>
      <div id="firebaseAdminInbox"><div class="empty">Loading private conversations...</div></div>
    </section>
    ${state.complaints.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tracking</th><th>Category</th><th>From</th>
            <th>Message</th><th>Status</th><th>Follow-up</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${state.complaints.slice().reverse().map(c => `
            <tr>
              <td><span class="track-id">${escapeHtml(c.trackingId)}</span><br>
                  <span class="muted small">${fmtDate(c.date)}</span></td>
              <td>${escapeHtml(c.category)}</td>
              <td>${c.anonymous ? '<em class="muted">Anonymous</em>' : escapeHtml(c.name || '—')}</td>
              <td style="max-width:320px">${escapeHtml(c.message)}
                ${c.photo ? `<br><button class="text-link" data-complaint-photo="${c.id}">View attached photo</button>` : ''}
              </td>
              <td>
                <select data-complaint="${c.id}">
                  ${['Received','In progress','Solved'].map(s =>
                    `<option ${c.status === s ? 'selected' : ''}>${s}</option>`
                  ).join('')}
                </select>
              </td>
              <td>
                <div class="complaint-admin-fields">
                  <input type="text" value="${escapeAttr(c.assignedTo || '')}" placeholder="Assign to" data-assignee="${c.id}">
                  <textarea placeholder="Reply to student" data-reply="${c.id}">${escapeHtml(c.reply || '')}</textarea>
                  <button class="btn btn-outline btn-sm" data-save-followup="${c.id}">Save follow-up</button>
                </div>
              </td>
              <td>
                <button class="btn btn-danger btn-sm" data-del-complaint="${c.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
  `;
}

function bindAdminComplaints() {
  $$('select[data-complaint]').forEach(sel => {
    sel.addEventListener('change', () => {
      if (!requireAdminAction()) return;
      const c = state.complaints.find(x => x.id === sel.dataset.complaint);
      if (!c) return;
      c.status = sel.value;
      saveState();
      toast(`Status updated to "${sel.value}"`, 'success');
    });
  });
  $$('button[data-del-complaint]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!requireAdminAction()) return;
      if (!confirm('Delete this complaint?')) return;
      state.complaints = state.complaints.filter(x => x.id !== btn.dataset.delComplaint);
      saveState();
      renderAdminTab('complaints');
      toast('Complaint deleted', 'success');
    });
  });
  $$('button[data-save-followup]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!requireAdminAction()) return;
      const c = state.complaints.find(x => x.id === btn.dataset.saveFollowup);
      if (!c) return;
      c.assignedTo = $(`[data-assignee="${c.id}"]`).value.trim();
      c.reply = $(`[data-reply="${c.id}"]`).value.trim();
      c.updatedAt = nowISO();
      saveState();
      toast('Complaint follow-up saved', 'success');
    });
  });
  $$('button[data-complaint-photo]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!requireAdminAction()) return;
      const complaint = state.complaints.find(c => c.id === btn.dataset.complaintPhoto);
      if (!complaint || !complaint.photo) return;
      openModal(`<h3>Photo for ${escapeHtml(complaint.trackingId)}</h3><img class="complaint-photo" src="${escapeAttr(complaint.photo)}" alt="Photo attached to complaint">`);
    });
  });
}

const PORTAL_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const PORTAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function validatePortalImage(file) {
  if (!file) return true;
  if (!PORTAL_IMAGE_TYPES[file.type]) {
    toast('Choose a JPEG, PNG, WebP, or GIF image.', 'error');
    return false;
  }
  if (file.size > PORTAL_IMAGE_MAX_BYTES) {
    toast('Images must be 5 MB or smaller.', 'error');
    return false;
  }
  if (!storage) {
    toast('Firebase Storage is not configured for image uploads.', 'error');
    return false;
  }
  return true;
}

async function uploadPortalImage(collectionName, itemId, file) {
  const extension = PORTAL_IMAGE_TYPES[file.type];
  const path = `${collectionName}/${itemId}/image-${uid('upload')}.${extension}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return { path, url: await getDownloadURL(ref(storage, path)) };
}

async function removePortalImage(path, description) {
  if (!path || !storage) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    toast(`${description} was removed, but its image could not be deleted: ${firebaseErrorMessage(error)}`, 'error');
  }
}

function bindPortalImagePreview(input, preview) {
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!validatePortalImage(file)) {
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') return;
      preview.src = reader.result;
      preview.classList.remove('hidden');
    });
    reader.addEventListener('error', () => {
      toast('The selected image could not be previewed.', 'error');
      input.value = '';
    }, { once: true });
    reader.readAsDataURL(file);
  });
}

function adminNotices() {
  return `
    <div class="grid grid-2">
      <form id="adminNoticeForm" class="card form">
        <h3>Post a notice</h3>
        <div class="field">
          <label for="anTitle">Title</label>
          <input id="anTitle" required placeholder="Notice title">
        </div>
        <div class="field">
          <label for="anCategory">Category</label>
          <select id="anCategory">
            <option value="exam">Exam</option>
            <option value="event">Event</option>
            <option value="scholarship">Scholarship</option>
            <option value="general" selected>General</option>
          </select>
        </div>
        <div class="field">
          <label for="anBody">Body</label>
          <textarea id="anBody" rows="4" required placeholder="Notice details..."></textarea>
        </div>
        <div class="field">
          <label for="anImage">Image <span class="muted">(optional)</span></label>
          <input id="anImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
          <span class="muted small">JPEG, PNG, WebP, or GIF; up to 5 MB.</span>
          <img id="anImagePreview" class="admin-image-preview hidden" alt="Selected notice image preview">
        </div>
        <button class="btn btn-primary" type="submit">Publish notice</button>
      </form>

      <div class="card">
        <h3>All notices (${state.notices.length})</h3>
        ${state.notices.slice().reverse().map(n => `
          <div class="between" style="padding:.45rem 0;border-bottom:1px solid var(--border)">
            <div>
              <div>${escapeHtml(n.title)}</div>
              <span class="muted small">${n.category} · ${fmtDate(n.date)}</span>
            </div>
            <div class="card-actions">
              <button class="btn btn-outline btn-sm" data-edit-notice="${n.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-del-notice="${n.id}">Delete</button>
            </div>
          </div>
        `).join('') || '<p class="muted small">No notices yet.</p>'}
      </div>
    </div>
  `;
}

function bindAdminNotices() {
  bindPortalImagePreview($('#anImage'), $('#anImagePreview'));
  $('#adminNoticeForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
    const form = e.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const file = $('#anImage').files?.[0];
    if (!validatePortalImage(file)) return;
    const notice = {
      id: uid('n'),
      title: $('#anTitle').value.trim(),
      body: $('#anBody').value.trim(),
      category: $('#anCategory').value,
      date: nowISO(),
    };
    let uploadedImage = null;
    submit.disabled = true;
    try {
      if (file) {
        uploadedImage = await uploadPortalImage('notices', notice.id, file);
        notice.image = uploadedImage.url;
        notice.imagePath = uploadedImage.path;
      }
      state.notices.push(notice);
      cacheStateLocally();
      await persistPublicContentNow();
      toast('Notice published', 'success');
      renderAdminTab('notices');
    } catch (error) {
      state.notices = state.notices.filter(item => item.id !== notice.id);
      cacheStateLocally();
      if (uploadedImage) await removePortalImage(uploadedImage.path, 'Notice');
      toast(`Notice could not be published: ${firebaseErrorMessage(error)}`, 'error');
    } finally {
      submit.disabled = false;
    }
  });
  $$('button[data-del-notice]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!requireAdminAction()) return;
      if (!confirm('Delete this notice?')) return;
      const index = state.notices.findIndex(notice => notice.id === btn.dataset.delNotice);
      const [notice] = state.notices.splice(index, 1);
      if (!notice) return;
      btn.disabled = true;
      cacheStateLocally();
      try {
        await persistPublicContentNow();
        await removePortalImage(notice.imagePath, 'Notice');
        renderAdminTab('notices');
        toast('Notice deleted', 'success');
      } catch (error) {
        state.notices.splice(index, 0, notice);
        cacheStateLocally();
        toast(`Notice could not be deleted: ${firebaseErrorMessage(error)}`, 'error');
        btn.disabled = false;
      }
    });
  });
  $$('button[data-edit-notice]').forEach(btn => {
    btn.addEventListener('click', () => openNoticeEditor(btn.dataset.editNotice));
  });
}

function openNoticeEditor(id) {
  if (!requireAdminAction()) return;
  const notice = state.notices.find(n => n.id === id);
  if (!notice) return;
  openModal(`
    <h3>Edit notice</h3>
    <form id="editNoticeForm" class="form mt-1">
      <div class="field"><label for="editNoticeTitle">Title</label><input id="editNoticeTitle" required value="${escapeAttr(notice.title)}"></div>
      <div class="field"><label for="editNoticeCategory">Category</label>
        <select id="editNoticeCategory">${['exam','event','scholarship','general'].map(c => `<option value="${c}" ${notice.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="editNoticeBody">Details</label><textarea id="editNoticeBody" required rows="5">${escapeHtml(notice.body)}</textarea></div>
      <div class="field">
        <label for="editNoticeImage">Image <span class="muted">(optional)</span></label>
        <input id="editNoticeImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
        <span class="muted small">JPEG, PNG, WebP, or GIF; up to 5 MB.</span>
        <img id="editNoticeImagePreview" class="admin-image-preview ${notice.image ? '' : 'hidden'}" src="${escapeAttr(notice.image || '')}" alt="Notice image preview">
      </div>
      <div class="card-actions"><button class="btn btn-primary" type="submit">Save changes</button><button class="btn btn-outline" type="button" data-close-modal>Cancel</button></div>
    </form>
  `);
  bindPortalImagePreview($('#editNoticeImage'), $('#editNoticeImagePreview'));
  $('#editNoticeForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
    const file = $('#editNoticeImage').files?.[0];
    if (!validatePortalImage(file)) return;
    const submit = e.currentTarget.querySelector('button[type="submit"]');
    const original = { ...notice };
    let uploadedImage = null;
    submit.disabled = true;
    try {
      if (file) uploadedImage = await uploadPortalImage('notices', notice.id, file);
      notice.title = $('#editNoticeTitle').value.trim();
      notice.category = $('#editNoticeCategory').value;
      notice.body = $('#editNoticeBody').value.trim();
      notice.date = nowISO();
      if (uploadedImage) {
        notice.image = uploadedImage.url;
        notice.imagePath = uploadedImage.path;
      }
      cacheStateLocally();
      await persistPublicContentNow();
      if (uploadedImage && original.imagePath) await removePortalImage(original.imagePath, 'Previous notice image');
      closeModal();
      renderAdminTab('notices');
      toast('Notice updated', 'success');
    } catch (error) {
      Object.assign(notice, original);
      cacheStateLocally();
      if (uploadedImage) await removePortalImage(uploadedImage.path, 'Notice');
      toast(`Notice could not be updated: ${firebaseErrorMessage(error)}`, 'error');
      submit.disabled = false;
    }
  });
}

function adminEvents() {
  return `
    <div class="grid grid-2">
      <form id="adminEventForm" class="card form">
        <h3>Add an event</h3>
        <div class="field">
          <label for="aeTitle">Title</label>
          <input id="aeTitle" required placeholder="Event title">
        </div>
        <div class="grid grid-2">
          <div class="field">
            <label for="aeDate">Date</label>
            <input id="aeDate" type="date" min="${dateAfter(0)}" required>
          </div>
          <div class="field">
            <label for="aeTime">Time</label>
            <input id="aeTime" placeholder="e.g. 10:00 AM">
          </div>
        </div>
        <div class="field">
          <label for="aeLocation">Location</label>
          <input id="aeLocation" placeholder="e.g. Main Auditorium">
        </div>
        <div class="field">
          <label for="aeDescription">Description</label>
          <textarea id="aeDescription" rows="3" placeholder="What is the event about?"></textarea>
        </div>
        <div class="field">
          <label for="aeImage">Image <span class="muted">(optional)</span></label>
          <input id="aeImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
          <span class="muted small">JPEG, PNG, WebP, or GIF; up to 5 MB.</span>
          <img id="aeImagePreview" class="admin-image-preview hidden" alt="Selected event image preview">
        </div>
        <div class="field checkbox">
          <input id="aeFeedback" type="checkbox" checked>
          <label for="aeFeedback">Ask campus students whether to organize this event and invite suggestions</label>
        </div>
        <button class="btn btn-primary" type="submit">Add event</button>
      </form>

      <div class="card">
        <h3>All events (${state.events.length})</h3>
        ${state.events.slice().reverse().map(ev => `
          <div style="padding:.55rem 0;border-bottom:1px solid var(--border)">
            <div class="between">
              <div>
                <div>${escapeHtml(ev.title)}</div>
                <span class="muted small">${escapeHtml(ev.date)} · ${ev.registrations.length} registered${ev.feedbackPoll?.enabled ? ` · ${ev.feedbackPoll.responses?.length || 0} feedback responses` : ''}</span>
              </div>
              <div style="display:flex;gap:.35rem;flex-wrap:wrap">
              ${ev.feedbackPoll?.enabled ? `<button class="btn btn-outline btn-sm" data-view-feedback="${ev.id}">Feedback</button>` : ''}
              <button class="btn btn-outline btn-sm" data-view-regs="${ev.id}">
                  Registrations
                </button>
                <button class="btn btn-outline btn-sm" data-edit-event="${ev.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-del-event="${ev.id}">Delete</button>
              </div>
            </div>
          </div>
        `).join('') || '<p class="muted small">No events yet.</p>'}
      </div>
    </div>
  `;
}

function bindAdminEvents() {
  bindPortalImagePreview($('#aeImage'), $('#aeImagePreview'));
  $('#adminEventForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
    const form = e.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const file = $('#aeImage').files?.[0];
    if (!validatePortalImage(file)) return;
    const event = {
      id: uid('e'),
      title: $('#aeTitle').value.trim(),
      date: $('#aeDate').value,
      time: $('#aeTime').value.trim(),
      location: $('#aeLocation').value.trim(),
      description: $('#aeDescription').value.trim(),
      registrations: [],
      feedbackPoll: {
        enabled: $('#aeFeedback').checked,
        responses: [],
      },
    };
    let uploadedImage = null;
    submit.disabled = true;
    try {
      if (file) {
        uploadedImage = await uploadPortalImage('events', event.id, file);
        event.image = uploadedImage.url;
        event.imagePath = uploadedImage.path;
      }
      state.events.push(event);
      cacheStateLocally();
      await persistPublicContentNow();
      toast('Event added', 'success');
      renderAdminTab('events');
    } catch (error) {
      state.events = state.events.filter(item => item.id !== event.id);
      cacheStateLocally();
      if (uploadedImage) await removePortalImage(uploadedImage.path, 'Event');
      toast(`Event could not be added: ${firebaseErrorMessage(error)}`, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  $$('button[data-del-event]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!requireAdminAction()) return;
      if (!confirm('Delete this event?')) return;
      const id = btn.dataset.delEvent;
      btn.disabled = true;
      try {
        const [registrations, feedback] = await Promise.all([
          getDocs(collection(db, 'events', id, 'registrations')),
          getDocs(collection(db, 'events', id, 'feedback')),
        ]);
        await Promise.all([
          ...registrations.docs.map(item => deleteDoc(item.ref)),
          ...feedback.docs.map(item => deleteDoc(item.ref)),
        ]);
        const event = state.events.find(item => item.id === id);
        state.events = state.events.filter(event => event.id !== id);
        state.eventRegs = state.eventRegs.filter(eventId => eventId !== id);
        stopParticipationSubscriptions();
        cacheStateLocally();
        await persistPublicContentNow();
        await removePortalImage(event?.imagePath, 'Event');
        renderAdminTab('events');
        toast('Event and its private participation data deleted.', 'success');
      } catch (error) {
        toast(`Event could not be deleted: ${firebaseErrorMessage(error)}`, 'error');
        btn.disabled = false;
      }
    });
  });

  $$('button[data-view-regs]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (requireAdminAction()) openRegistrationsModal(btn.dataset.viewRegs);
    });
  });
  $$('button[data-view-feedback]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (requireAdminAction()) openEventFeedbackModal(btn.dataset.viewFeedback);
    });
  });
  $$('button[data-edit-event]').forEach(btn => {
    btn.addEventListener('click', () => openEventEditor(btn.dataset.editEvent));
  });
}

function openEventEditor(id) {
  if (!requireAdminAction()) return;
  const event = state.events.find(ev => ev.id === id);
  if (!event) return;
  openModal(`
    <h3>Edit event</h3>
    <form id="editEventForm" class="form mt-1">
      <div class="field"><label for="editEventTitle">Title</label><input id="editEventTitle" required value="${escapeAttr(event.title)}"></div>
      <div class="grid grid-2">
        <div class="field"><label for="editEventDate">Date</label><input id="editEventDate" type="date" required value="${escapeAttr(event.date)}"></div>
        <div class="field"><label for="editEventTime">Time</label><input id="editEventTime" value="${escapeAttr(event.time || '')}"></div>
      </div>
      <div class="field"><label for="editEventLocation">Location</label><input id="editEventLocation" value="${escapeAttr(event.location || '')}"></div>
      <div class="field"><label for="editEventDescription">Description</label><textarea id="editEventDescription" rows="4">${escapeHtml(event.description || '')}</textarea></div>
      <div class="field">
        <label for="editEventImage">Image <span class="muted">(optional)</span></label>
        <input id="editEventImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
        <span class="muted small">JPEG, PNG, WebP, or GIF; up to 5 MB.</span>
        <img id="editEventImagePreview" class="admin-image-preview ${event.image ? '' : 'hidden'}" src="${escapeAttr(event.image || '')}" alt="Event image preview">
      </div>
      <div class="field checkbox"><input id="editEventFeedback" type="checkbox" ${event.feedbackPoll?.enabled ? 'checked' : ''}><label for="editEventFeedback">Collect verified campus student feedback for this event</label></div>
      <div class="card-actions"><button class="btn btn-primary" type="submit">Save changes</button><button class="btn btn-outline" type="button" data-close-modal>Cancel</button></div>
    </form>
  `);
  bindPortalImagePreview($('#editEventImage'), $('#editEventImagePreview'));
  $('#editEventForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
    const file = $('#editEventImage').files?.[0];
    if (!validatePortalImage(file)) return;
    const submit = e.currentTarget.querySelector('button[type="submit"]');
    const original = { ...event };
    let uploadedImage = null;
    submit.disabled = true;
    try {
      if (file) uploadedImage = await uploadPortalImage('events', event.id, file);
      event.title = $('#editEventTitle').value.trim();
      event.date = $('#editEventDate').value;
      event.time = $('#editEventTime').value.trim();
      event.location = $('#editEventLocation').value.trim();
      event.description = $('#editEventDescription').value.trim();
      event.feedbackPoll = {
        enabled: $('#editEventFeedback').checked,
        question: event.feedbackPoll?.question || '',
        responses: event.feedbackPoll?.responses || [],
      };
      if (uploadedImage) {
        event.image = uploadedImage.url;
        event.imagePath = uploadedImage.path;
      }
      cacheStateLocally();
      await persistPublicContentNow();
      if (uploadedImage && original.imagePath) await removePortalImage(original.imagePath, 'Previous event image');
      closeModal();
      renderAdminTab('events');
      toast('Event updated', 'success');
    } catch (error) {
      Object.assign(event, original);
      cacheStateLocally();
      if (uploadedImage) await removePortalImage(uploadedImage.path, 'Event');
      toast(`Event could not be updated: ${firebaseErrorMessage(error)}`, 'error');
      submit.disabled = false;
    }
  });
}

function openEventFeedbackModal(eventId) {
  if (!requireAdminAction()) return;
  const event = state.events.find(item => item.id === eventId);
  if (!event?.feedbackPoll?.enabled) return;
  const responses = Array.isArray(event.feedbackPoll.responses) ? event.feedbackPoll.responses : [];
  const summary = EVENT_FEEDBACK_CHOICES.map(choice => {
    const count = responses.filter(response => response.choice === choice).length;
    const percent = responses.length ? Math.round(count / responses.length * 100) : 0;
    return `<div class="feedback-result">
      <div class="between"><span>${choice}</span><span class="muted small">${count} · ${percent}%</span></div>
      <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
    </div>`;
  }).join('');
  const suggestions = responses
    .filter(response => response.suggestion?.trim())
    .map(response => `<li><strong>${escapeHtml(response.choice)}:</strong> ${escapeHtml(response.suggestion)}</li>`)
    .join('');
  openModal(`
    <p class="eyebrow">EVENT FEEDBACK</p>
    <h3>${escapeHtml(event.feedbackPoll.question || `Should we organize ${event.title}?`)}</h3>
    <p class="muted small">${responses.length} student response${responses.length === 1 ? '' : 's'}</p>
    ${summary}
    <h4 class="mt-1">Suggestions</h4>
    ${suggestions ? `<ul class="feedback-suggestions">${suggestions}</ul>` : '<p class="muted small">No written suggestions yet.</p>'}
    <div class="card-actions"><button class="btn btn-outline" type="button" data-close-modal>Close</button></div>
  `);
}

function openRegistrationsModal(eventId) {
  if (!requireAdminAction()) return;
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return;

  const regs = ev.registrations.slice().reverse();

  const body = regs.length
    ? `
      <div class="table-wrap" style="box-shadow:none">
        <table>
          <thead>
            <tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Dept</th><th>When</th></tr>
          </thead>
          <tbody>
            ${regs.map((r, i) => `
              <tr>
                <td>${regs.length - i}</td>
                <td>${escapeHtml(r.name || '—')}</td>
                <td>${escapeHtml(r.email || '—')}</td>
                <td>${escapeHtml(r.phone || '—')}</td>
                <td>${escapeHtml(r.dept || '—')}</td>
                <td><span class="muted small">${fmtDateTime(r.date)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : `<p class="muted">No registrations yet for this event.</p>`;

  openModal(`
    <h3>${escapeHtml(ev.title)}</h3>
    <p class="muted small mb-1">
      ${escapeHtml(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}
      ${ev.location ? ' · ' + escapeHtml(ev.location) : ''}
    </p>
    <p class="mb-1"><strong>${regs.length}</strong> registration${regs.length === 1 ? '' : 's'}</p>
    ${body}
    <div class="card-actions">
      <button class="btn btn-primary" type="button" id="exportEventRegistrations"${regs.length ? '' : ' disabled'}>Export</button>
      <button class="btn btn-outline" data-close-modal>Close</button>
    </div>
  `);
  $('#exportEventRegistrations').addEventListener('click', () => {
    if (requireAdminAction()) exportEventRegistrations(ev, regs);
  });
}

function exportEventRegistrations(event, registrations) {
  const headers = ['#', 'Name', 'Email', 'Phone', 'Department', 'Notes', 'Registered at'];
  const rows = [
    headers,
    ...registrations.map((registration, index) => [
      String(registrations.length - index),
      registration.name || '',
      registration.email || '',
      registration.phone || '',
      registration.dept || '',
      registration.notes || '',
      fmtDateTime(registration.date),
    ]),
  ];
  const xmlEscape = value => String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[character]);
  const worksheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const lastRow = rows.length;
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="Registrations" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '</Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + `<dimension ref="A1:G${lastRow}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="8" customWidth="1"/>'
      + '<col min="2" max="2" width="24" customWidth="1"/><col min="3" max="3" width="32" customWidth="1"/>'
      + '<col min="4" max="4" width="18" customWidth="1"/><col min="5" max="5" width="24" customWidth="1"/>'
      + '<col min="6" max="6" width="40" customWidth="1"/><col min="7" max="7" width="24" customWidth="1"/>'
      + `</cols><sheetData>${worksheetRows}</sheetData><autoFilter ref="A1:G${lastRow}"/></worksheet>`),
  };
  const workbook = zipSync(files);
  const blob = new Blob([workbook], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeTitle = event.title.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-');
  link.href = url;
  link.download = `${safeTitle || 'event'}-registrations.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function adminLostFound() {
  if (!state.lostfound.length) {
    return `<div class="empty">No lost &amp; found posts yet.</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Type</th><th>Item</th><th>Location</th><th>Contact</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${state.lostfound.slice().reverse().map(i => `
            <tr>
              <td><span class="badge ${i.type === 'lost' ? 'badge-event' : 'badge-scholarship'}">${i.type}</span></td>
              <td>${escapeHtml(i.title)}</td>
              <td>${escapeHtml(i.location)}</td>
              <td>${escapeHtml(i.contact)}</td>
              <td>${i.approved === false ? '<span class="badge status-received">Pending</span>' : '<span class="badge status-solved">Approved</span>'}</td>
              <td>
                ${i.approved === false
                  ? `<button class="btn btn-primary btn-sm" data-approve="${i.id}">Approve</button>`
                  : `<button class="btn btn-outline btn-sm" data-unapprove="${i.id}">Hide</button>`}
                <button class="btn btn-danger btn-sm" data-del-lf="${i.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function bindAdminLostFound() {
  $$('button[data-approve]').forEach(b => b.addEventListener('click', async () => {
    if (!requireAdminAction()) return;
    const item = state.lostfound.find(post => post.id === b.dataset.approve);
    if (!item) return;
    b.disabled = true;
    try {
      await updateDoc(doc(db, 'lostFoundPosts', item.id), { approved: true });
      item.approved = true;
      cacheStateLocally();
      renderAdminTab('lostfound');
      toast('Approved', 'success');
    } catch (error) {
      toast(`Post could not be approved: ${firebaseErrorMessage(error)}`, 'error');
      b.disabled = false;
    }
  }));
  $$('button[data-unapprove]').forEach(b => b.addEventListener('click', async () => {
    if (!requireAdminAction()) return;
    const item = state.lostfound.find(post => post.id === b.dataset.unapprove);
    if (!item) return;
    b.disabled = true;
    try {
      await updateDoc(doc(db, 'lostFoundPosts', item.id), { approved: false });
      item.approved = false;
      cacheStateLocally();
      renderAdminTab('lostfound');
      toast('Hidden from public', 'success');
    } catch (error) {
      toast(`Post could not be hidden: ${firebaseErrorMessage(error)}`, 'error');
      b.disabled = false;
    }
  }));
  $$('button[data-del-lf]').forEach(b => b.addEventListener('click', async () => {
    if (!requireAdminAction()) return;
    if (!confirm('Delete this post?')) return;
    const item = state.lostfound.find(post => post.id === b.dataset.delLf);
    if (!item) return;
    b.disabled = true;
    try {
      await deleteDoc(doc(db, 'lostFoundPosts', item.id));
      state.lostfound = state.lostfound.filter(post => post.id !== item.id);
      let photoCleanupFailed = false;
      if (storage && item.photoPath) {
        try {
          await deleteObject(ref(storage, item.photoPath));
        } catch (error) {
          photoCleanupFailed = true;
          toast(`Post deleted, but its image could not be removed: ${firebaseErrorMessage(error)}`, 'error');
        }
      }
      cacheStateLocally();
      renderAdminTab('lostfound');
      if (!photoCleanupFailed) toast('Deleted', 'success');
    } catch (error) {
      toast(`Post could not be deleted: ${firebaseErrorMessage(error)}`, 'error');
      b.disabled = false;
    }
  }));
}

/* ============================================================
   EVENT REGISTRATION — now opens a form modal
   ============================================================ */
function openEventRegisterModal(eventId) {
  const ev = state.events.find(x => x.id === eventId);
  if (!ev) return;

  // Already registered in this browser?
  if (state.eventRegs.includes(ev.id)) {
    toast('You have already registered for this event');
    return;
  }

  openModal(`
    <h3>Register for ${escapeHtml(ev.title)}</h3>
    <p class="muted small mb-1">
      ${lineIcon('calendar')} ${escapeHtml(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}
      ${ev.location ? ` · ${lineIcon('location')} ${escapeHtml(ev.location)}` : ''}
    </p>
    <p class="muted small mb-1">
      Please fill in your details to confirm your spot.
    </p>

    <form id="eventRegForm" class="form">
      <div class="field">
        <label for="erName">Full name *</label>
        <input id="erName" type="text" maxlength="100" required placeholder="Your full name">
      </div>
      <div class="field">
        <label for="erEmail">Account email</label>
        <input id="erEmail" type="email" maxlength="254" required readonly value="${escapeAttr(currentUser.email || '')}">
      </div>
      <div class="field">
        <label for="erPhone">Phone number *</label>
        <input id="erPhone" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[0-9]{10}" minlength="10" maxlength="10" required placeholder="10 digits">
      </div>
      <div class="field">
        <label for="erDept">Department / Semester *</label>
        <input id="erDept" type="text" maxlength="100" required placeholder="e.g. BCA, 4th semester">
      </div>
      <div class="field">
        <label for="erNotes">Anything we should know? (optional)</label>
        <textarea id="erNotes" rows="2" maxlength="1000" placeholder="Dietary needs, accessibility, etc."></textarea>
      </div>

      <div class="card-actions" style="margin-top:.4rem">
        <button class="btn btn-primary" type="submit">Confirm registration</button>
        <button class="btn btn-outline" type="button" data-close-modal>Cancel</button>
      </div>
      <div id="erResult"></div>
    </form>
  `);

  // Bind form submit
  $('#eventRegForm').addEventListener('submit', e => handleEventRegisterSubmit(e, ev.id));

  // Autofocus first field
  setTimeout(() => $('#erName')?.focus(), 50);
}

async function handleEventRegisterSubmit(e, eventId) {
  e.preventDefault();
  if (!hasCampusAccess() || isAdminUser) {
    toast('Your student ID must be approved before you can register.', 'error');
    navigate('login');
    return;
  }

  const ev = state.events.find(x => x.id === eventId);
  if (!ev) { closeModal(); return; }

  const name  = $('#erName').value.trim();
  const email = $('#erEmail').value.trim();
  const phone = $('#erPhone').value.trim();
  const dept  = $('#erDept').value.trim();
  const notes = $('#erNotes').value.trim();
  const result = $('#erResult');

  // Basic validation (HTML required already handles most)
  if (!name || !email || !phone || !dept) {
    result.innerHTML = `<div class="alert alert-error">Please fill in all required fields.</div>`;
    return;
  }
  if (!isValidEmail(email) || email.toLowerCase() !== (currentUser.email || '').toLowerCase()) {
    result.innerHTML = '<div class="alert alert-error">Use the email address on your verified portal account.</div>';
    return;
  }
  if (!isTenDigitPhone(phone)) {
    result.innerHTML = `<div class="alert alert-error">Please enter a phone number containing exactly 10 digits.</div>`;
    return;
  }

  // Prevent duplicate registration from same email for this event
  const duplicate = ev.registrations.some(
    r => r.email && r.email.toLowerCase() === email.toLowerCase()
  );
  if (duplicate) {
    result.innerHTML = `<div class="alert alert-warning">This email is already registered for this event.</div>`;
    return;
  }

  const registerButton = $('#eventRegForm button[type="submit"]');
  registerButton.disabled = true;
  try {
    const registrationRef = doc(db, 'events', eventId, 'registrations', currentUser.uid);
    if ((await getDoc(registrationRef)).exists()) {
      result.innerHTML = `<div class="alert alert-warning">This account is already registered for this event.</div>`;
      return;
    }
    const registration = {
      eventId,
      userUid: currentUser.uid,
      name, email, phone, dept, notes,
      date: nowISO(),
    };
    await setDoc(registrationRef, registration);
    ev.registrations = [registration];
    ev.registrationCount = (ev.registrationCount || 0) + 1;
  } catch (error) {
    result.innerHTML = `<div class="alert alert-error">${escapeHtml(firebaseErrorMessage(error))}</div>`;
    return;
  } finally {
    registerButton.disabled = false;
  }
  if (!state.eventRegs.includes(eventId)) state.eventRegs.push(eventId);
  saveState();

  result.innerHTML = `
    <div class="alert alert-success">
      ${lineIcon('check')} You're registered, <strong>${escapeHtml(name)}</strong>!
      Your event registration is saved for ${escapeHtml(email)}.
    </div>
  `;

  toast('Registration confirmed', 'success');

  // Refresh the events list behind the modal
  renderEvents();
  renderHome();

  // Close the modal after a short pause so the user sees the success message
  setTimeout(closeModal, 1400);
}

async function handleEventFeedbackSubmit(event) {
  event.preventDefault();
  if (!hasCampusAccess() || isAdminUser) {
    toast('Your student ID must be approved before you can send event feedback.', 'error');
    navigate('login');
    return;
  }
  const form = event.target.closest('[data-event-feedback]');
  if (!form) return;
  const campusEvent = state.events.find(item => item.id === form.dataset.eventFeedback);
  if (!campusEvent?.feedbackPoll?.enabled) {
    toast('This event is not collecting feedback.', 'error');
    return;
  }
  const responses = campusEvent.feedbackPoll.responses || (campusEvent.feedbackPoll.responses = []);
  if (responses.some(response => response.userId === currentUser.uid)) {
    toast('You have already shared feedback for this event.');
    return;
  }
  const data = new FormData(form);
  const choice = data.get(`event-choice-${campusEvent.id}`);
  if (!EVENT_FEEDBACK_CHOICES.includes(choice)) {
    toast('Choose Yes, No, or Maybe before sending feedback.', 'error');
    return;
  }
  const suggestion = String(data.get('suggestion') || '').trim();
  if (suggestion.length > 1000) {
    toast('Suggestions must be 1,000 characters or fewer.', 'error');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const responseRef = doc(db, 'events', campusEvent.id, 'feedback', currentUser.uid);
    if ((await getDoc(responseRef)).exists()) {
      toast('You have already shared feedback for this event.');
      return;
    }
    const response = {
      eventId: campusEvent.id,
      userUid: currentUser.uid,
      choice,
      suggestion,
      submittedAt: nowISO(),
    };
    await setDoc(responseRef, response);
    responses.push({ ...response, userId: currentUser.uid });
  } catch (error) {
    toast(`Event feedback could not be sent: ${firebaseErrorMessage(error)}`, 'error');
    return;
  } finally {
    button.disabled = false;
  }
  saveState();
  renderEvents();
  toast('Your event feedback has been sent.', 'success');
}

/* ============================================================
   LOST & FOUND SUBMIT
   ============================================================ */
async function handleLostFoundSubmit(e) {
  e.preventDefault();
  if (!hasCampusAccess() || isAdminUser) {
    toast('Student ID approval is required to post to Lost & Found.', 'error');
    navigate('login');
    return;
  }
  const contact = $('#lfContact').value.trim();
  if (!isTenDigitPhone(contact) && !isValidEmail(contact)) {
    toast('Enter a valid email address or a phone number containing exactly 10 digits.', 'error');
    $('#lfContact').focus();
    return;
  }
  const file = $('#lfPhoto').files?.[0];
  if (file && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    toast('Choose a JPEG, PNG, WebP, or GIF image.', 'error');
    $('#lfPhoto').focus();
    return;
  }
  if (file && file.size > 1024 * 1024) {
    toast('The item photo must be 1 MB or smaller.', 'error');
    $('#lfPhoto').focus();
    return;
  }
  if (file && !storage) {
    toast('Firebase Storage is not configured for item photos.', 'error');
    $('#lfPhoto').focus();
    return;
  }

  const submit = $('#lostFoundForm button[type="submit"]');
  submit.disabled = true;
  let uploadedPhotoPath = '';
  try {
    const id = uid('lf');
    const item = {
      id,
      type: $('#lfType').value,
      title: $('#lfTitle').value.trim(),
      location: $('#lfLocation').value.trim(),
      contact,
      description: $('#lfDesc').value.trim(),
      date: nowISO(),
      approved: true,
    };
    if (file) {
      const extension = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      }[file.type];
      uploadedPhotoPath = `lostFound/${currentUser.uid}/${id}/photo.${extension}`;
      await uploadBytes(ref(storage, uploadedPhotoPath), file, { contentType: file.type });
      item.photoPath = uploadedPhotoPath;
      item.photo = await getDownloadURL(ref(storage, uploadedPhotoPath));
    }
    await setDoc(doc(db, 'lostFoundPosts', id), {
      ...item,
      ownerUid: currentUser.uid,
    });
    state.lostfound = [item, ...state.lostfound.filter(post => post.id !== item.id)];
    cacheStateLocally();
  } catch (error) {
    if (uploadedPhotoPath) {
      try {
        await deleteObject(ref(storage, uploadedPhotoPath));
      } catch (cleanupError) {
        toast(`Item photo cleanup failed: ${firebaseErrorMessage(cleanupError)}`, 'error');
      }
    }
    toast(firebaseErrorMessage(error), 'error');
    return;
  } finally {
    submit.disabled = false;
  }
  e.target.reset();
  toast('Posted to Lost & Found', 'success');
  renderLostFound();
}

/* ============================================================
   UTILITIES
   ============================================================ */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(str) { return escapeHtml(str); }
function downloadCalendarReminder(eventId) {
  const event = state.events.find(item => item.id === eventId);
  if (!event) return;
  const date = event.date.replace(/-/g, '');
  const escapeICS = value => String(value || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r\n|\r|\n/g, '\\n');
  const stamp = nowISO().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const content = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hack Our Campus//FSU Portal//EN',
    'BEGIN:VEVENT', `UID:${event.id}@hackourcampus.local`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${date}`, 'DURATION:P1D',
    `SUMMARY:${escapeICS(event.title)}`, `LOCATION:${escapeICS(event.location)}`,
    `DESCRIPTION:${escapeICS(event.description)}`, 'BEGIN:VALARM',
    'TRIGGER:-PT9H', 'ACTION:DISPLAY',     `DESCRIPTION:${escapeICS(event.title)} is coming up tomorrow`,
    'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'campus-event'}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Calendar reminder downloaded', 'success');
}

function safeExternalUrl(value) {
  if (!value || value === '#') return '#';
  try {
    const url = new URL(value, window.location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}
function statusClass(status) {
  if (status === 'Solved') return 'solved';
  if (status === 'In progress') return 'inprogress';
  return 'received';
}

/* ============================================================
   INITIALISE
   ============================================================ */
function init() {
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_KEY);
  } catch {
    toast('Theme preference could not be loaded.', 'error');
  }
  document.body.classList.toggle('theme-dark', storedTheme === 'dark');
  updateThemeToggle();
  startPublicContentSync();
  startLostFoundSync();

  /* ---- Navigation clicks ---- */
  document.addEventListener('click', e => {
    const closeNotice = e.target.closest('[data-close-notice-detail]');
    if (closeNotice) {
      closeNoticeDetail();
      return;
    }
    const notice = e.target.closest('[data-notice-id]');
    if (notice) {
      e.preventDefault();
      openNoticeDetail(notice.dataset.noticeId, notice);
      return;
    }
    const nav = e.target.closest('[data-page]');
    if (nav) {
      e.preventDefault();
      if (nav.matches('.announcement-link')) $('.announcement-bar')?.remove();
      navigate(nav.dataset.page);
    }
  });
  document.addEventListener('keydown', e => {
    const notice = e.target.closest('#noticeList [data-notice-id]');
    if (notice && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openNoticeDetail(notice.dataset.noticeId, notice);
    }
  });

  /* ---- Mobile nav toggle ---- */
  $('#navToggle').addEventListener('click', () => {
    const isOpen = $('#mainNav').classList.toggle('open');
    $('#navToggle').classList.toggle('is-open', isOpen);
    $('#navToggle').setAttribute('aria-expanded', String(isOpen));
    $('#navToggle').setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  });
  $('#moreToggle').addEventListener('click', () => {
    const isOpen = $('#moreMenu').classList.toggle('hidden');
    $('#moreToggle').setAttribute('aria-expanded', String(!isOpen));
  });
  document.addEventListener('click', event => {
    if (event.target.closest('.nav-more')) return;
    $('#moreMenu').classList.add('hidden');
    $('#moreToggle').setAttribute('aria-expanded', 'false');
  });
  $('#themeToggle').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('theme-dark');
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      toast('Theme changed, but this preference could not be saved.', 'error');
    }
    updateThemeToggle();
  });
  $('#createAccountCta').addEventListener('click', () => {
    navigate('login');
    if (!isRegisterMode) {
      isRegisterMode = true;
      authNotice = '';
      $('#authForm').reset();
      renderAuthPage();
    }
    $('#authName').focus();
  });
  $('#authForm').addEventListener('submit', handleAuthSubmit);
  $('#studentVerificationForm').addEventListener('submit', handleStudentVerificationSubmit);
  $('#authModeToggle').addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    authNotice = '';
    $('#authResult').innerHTML = '';
    $('#authForm').reset();
    renderAuthPage();
  });
  $('#resetPassword').addEventListener('click', handlePasswordReset);
  $('#signOut').addEventListener('click', () => signOut(auth));
  $('#copyStudentId').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#studentId').textContent);
      toast('Student ID copied', 'success');
    } catch {
      toast('Could not copy ID. Select and copy it instead.', 'error');
    }
  });
  $('#supportThreads').addEventListener('submit', event => {
    if (event.target.closest('[data-support-reply]')) handlePrivateReply(event);
  });
  $('#adminArea').addEventListener('submit', event => {
    if (event.target.closest('[data-support-reply]')) handlePrivateReply(event);
  });
  $('#adminArea').addEventListener('change', async event => {
    const select = event.target.closest('[data-cloud-status]');
    if (!select) return;
    try {
      await updateDoc(doc(db, 'supportRequests', select.dataset.cloudStatus), {
        status: select.value,
        updatedAt: serverTimestamp(),
      });
      toast('Conversation status updated', 'success');
    } catch (error) {
      toast(`Status could not be updated: ${firebaseErrorMessage(error)}`, 'error');
    }
  });
  $('#adminArea').addEventListener('click', async event => {
    const button = event.target.closest('[data-save-assignee]');
    if (!button) return;
    const threadId = button.dataset.saveAssignee;
    const assignee = $(`[data-assignee="${threadId}"]`, $('#adminArea')).value.trim();
    try {
      await updateDoc(doc(db, 'supportRequests', threadId), {
        assignedTo: assignee,
        updatedAt: serverTimestamp(),
      });
      toast('Conversation assignment saved', 'success');
    } catch (error) {
      toast(`Assignment could not be saved: ${firebaseErrorMessage(error)}`, 'error');
    }
  });

  /* ---- Notice filters ---- */
  $('#noticeSearch').addEventListener('input', renderNotices);
  $('#noticeCategory').addEventListener('change', renderNotices);

  /* ---- Complaint form ---- */
  $('#complaintForm').addEventListener('submit', handlePrivateMessage);

  initAuth();

  /* ---- Event registration: open form modal (delegated) ---- */
  $('#eventList').addEventListener('click', e => {
    const calendarButton = e.target.closest('[data-calendar]');
    if (calendarButton) {
      downloadCalendarReminder(calendarButton.dataset.calendar);
      return;
    }
    const btn = e.target.closest('[data-register]');
    if (btn && !btn.disabled) openEventRegisterModal(btn.dataset.register);
  });

  $('#eventList').addEventListener('submit', event => {
    if (event.target.closest('[data-event-feedback]')) handleEventFeedbackSubmit(event);
  });

  /* ---- Lost & found form ---- */
  $('#lostFoundForm').addEventListener('submit', handleLostFoundSubmit);

  /* ---- Team contact buttons (delegated) ---- */
  $('#teamList').addEventListener('click', e => {
    const btn = e.target.closest('[data-contact]');
    if (!btn) return;
    openModal(`
      <h3>Contact ${escapeHtml(btn.dataset.contact)}</h3>
      <p class="muted">Reach out to <strong>${escapeHtml(btn.dataset.contact)}</strong> through the FSU office on campus.</p>
      <div class="card-actions">
        <button class="btn btn-outline" data-close-modal>Close</button>
      </div>
    `);
  });

  /* ---- Modal close ---- */
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeNoticeDetail();
      closeModal();
      $('#moreMenu').classList.add('hidden');
      $('#moreToggle').setAttribute('aria-expanded', 'false');
      $('#mainNav').classList.remove('open');
      $('#navToggle').classList.remove('is-open');
      $('#navToggle').setAttribute('aria-expanded', 'false');
      $('#navToggle').setAttribute('aria-label', 'Open navigation menu');
    }
  });

  /* ---- Initial render ---- */
  renderHome();
  renderNotices();
  renderEvents();
  renderOpportunities();
  renderLostFound();
  renderGallery();
  renderTeam();
  renderAdmin();

  navigate('home');

  console.log('%cFSU Portal ready', 'color:#1d4ed8;font-weight:bold');
}

export function mountLegacyApp() {
  init();
}