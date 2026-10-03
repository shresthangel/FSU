import { strToU8, zipSync } from 'fflate';
import {
  addDoc,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
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
} from './firebase-client.js';

/* ============================================================
   Hack Our Campus — FSU Portal
   All interactivity: navigation, forms, storage, admin
   ============================================================ */

/* ---------- Constants ---------- */
const STORE_KEY = 'hack_our_campus_v1';
const ADMIN_TAB_KEY = 'hoc_admin_tab';
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
  const paths = {
    notice: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 7h8M8 11h7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    opportunity: '<path d="M20 7h-9M14 17H5M20 17h-2M8 7H4"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    support: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M8.5 12h7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const pathsForIcon = paths[name];
  if (!pathsForIcon) throw new Error(`Unknown line icon: ${name}`);
  return `<svg class="line-icon ${escapeAttr(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${pathsForIcon}</svg>`;
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
    return true;
  } catch (e) {
    toast('Could not save data (storage full?)', 'error');
    return false;
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
    <button class="home-notice" data-page="notices">
      <span class="badge badge-${escapeAttr(n.category)}">${escapeHtml(n.category)}</span>
      <span class="home-notice-title">${escapeHtml(n.title)}</span>
      <span class="home-notice-date muted small">${lineIcon('calendar', 'notice-date-icon')}${fmtDate(n.date)}</span>
      <span class="home-notice-arrow">${lineIcon('arrow')}</span>
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
    <article class="card">
      <div class="card-head">
        <h3 class="card-title">${escapeHtml(n.title)}</h3>
        <span class="badge badge-${n.category}">${n.category}</span>
      </div>
      <div class="card-meta">
        <span>📅 ${fmtDate(n.date)}</span>
      </div>
      <p class="card-body">${escapeHtml(n.body)}</p>
    </article>
  `).join('');
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
      } else {
        const verificationRecord = await getDoc(doc(db, 'studentVerifications', user.uid));
        if (auth.currentUser?.uid !== user.uid) return;
        studentVerification = verificationRecord.exists() ? verificationRecord.data() : null;
        verificationUnsubscribe = onSnapshot(
          doc(db, 'studentVerifications', user.uid),
          snapshot => {
            if (auth.currentUser?.uid !== user.uid) return;
            studentVerification = snapshot.exists() ? snapshot.data() : null;
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
    const registered = state.eventRegs.includes(ev.id);
    const count = ev.registrations.length;
    return `
      <article class="card">
        <div class="card-head">
          <h3 class="card-title">${escapeHtml(ev.title)}</h3>
          <span class="badge badge-event">Event</span>
        </div>
        <div class="card-meta">
          <span>📅 ${escapeHtml(ev.date)} ${ev.time ? '· ' + escapeHtml(ev.time) : ''}</span>
          <span>📍 ${escapeHtml(ev.location || '—')}</span>
          <span>👥 ${count} registered</span>
        </div>
        <p class="card-body">${escapeHtml(ev.description || '')}</p>
        <div class="card-actions">
        <button class="btn btn-outline" data-calendar="${ev.id}">Add calendar reminder</button>
        ${hasCampusAccess()
          ? `<button class="btn ${registered ? 'btn-outline' : 'btn-primary'}" data-register="${escapeAttr(ev.id)}" ${registered ? 'disabled' : ''}>${registered ? '✓ Registered' : 'Register'}</button>`
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
  if (!hasCampusAccess()) {
    return `<section class="event-feedback event-feedback-locked">
      <p class="eyebrow">CAMPUS STUDENT FEEDBACK</p>
      <p class="muted small">Sign in with a verified email and admin-approved student ID to share your view.</p>
      <button class="text-link" type="button" data-page="login">Sign in or verify your student ID →</button>
    </section>`;
  }
  if (ownResponse) {
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
      <p class="muted small">Thanks for sharing your view. ${responses.length} student${responses.length === 1 ? '' : 's'} responded.</p>
      ${results}
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
        <span>🏢 ${escapeHtml(o.org || '—')}</span>
        <span>⏳ Deadline: ${escapeHtml(o.deadline || '—')}</span>
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
  $('#lostFoundForm').classList.toggle('hidden', !hasCampusAccess());
  $('#lostFoundAccessNotice')?.classList.toggle('hidden', hasCampusAccess());
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
        <span>📍 ${escapeHtml(i.location || '—')}</span>
        <span>📅 ${fmtDate(i.date)}</span>
      </div>
      ${i.description ? `<p class="card-body">${escapeHtml(i.description)}</p>` : ''}
      <div class="card-meta mt-1">
        <span>📞 Contact: ${escapeHtml(i.contact || '—')}</span>
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
    <div class="grid grid-2">
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
        <div class="grid gallery-grid">
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

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The selected image could not be read.'));
    };
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.readAsDataURL(file);
  });
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

    const submit = $('#adminGalleryForm button[type="submit"]');
    submit.disabled = true;
    try {
      const item = {
        id: uid('g'),
        caption: $('#agCaption').value.trim(),
        image: await readImageAsDataUrl(file),
      };
      state.gallery.unshift(item);
      if (!saveState()) {
        state.gallery.shift();
        return;
      }
      renderAdminTab('gallery');
      renderGallery();
      toast('Photo added to the gallery', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The image could not be added.', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  $$('button[data-delete-gallery]').forEach(button => {
    button.addEventListener('click', () => {
      if (!requireAdminAction()) return;
      const id = button.dataset.deleteGallery;
      const index = state.gallery.findIndex(item => item.id === id);
      if (index < 0) return;
      const [removed] = state.gallery.splice(index, 1);
      if (!saveState()) {
        state.gallery.splice(index, 0, removed);
        return;
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
            ${tabLabel(t)}
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
  if (tab === 'events')      { c.innerHTML = adminEvents();     bindAdminEvents(); }
  if (tab === 'lostfound')   { c.innerHTML = adminLostFound();  bindAdminLostFound(); }
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
  $('#adminNoticeForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
    state.notices.push({
      id: uid('n'),
      title: $('#anTitle').value.trim(),
      body: $('#anBody').value.trim(),
      category: $('#anCategory').value,
      date: nowISO(),
    });
    saveState();
    toast('Notice published', 'success');
    renderAdminTab('notices');
  });
  $$('button[data-del-notice]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!requireAdminAction()) return;
      if (!confirm('Delete this notice?')) return;
      state.notices = state.notices.filter(n => n.id !== btn.dataset.delNotice);
      saveState();
      renderAdminTab('notices');
      toast('Notice deleted', 'success');
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
      <div class="card-actions"><button class="btn btn-primary" type="submit">Save changes</button><button class="btn btn-outline" type="button" data-close-modal>Cancel</button></div>
    </form>
  `);
  $('#editNoticeForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
    notice.title = $('#editNoticeTitle').value.trim();
    notice.category = $('#editNoticeCategory').value;
    notice.body = $('#editNoticeBody').value.trim();
    notice.date = nowISO();
    saveState();
    closeModal();
    renderAdminTab('notices');
    toast('Notice updated', 'success');
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
  $('#adminEventForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
    state.events.push({
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
    });
    saveState();
    toast('Event added', 'success');
    renderAdminTab('events');
  });

  $$('button[data-del-event]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!requireAdminAction()) return;
      if (!confirm('Delete this event?')) return;
      const id = btn.dataset.delEvent;
      state.events = state.events.filter(x => x.id !== id);
      state.eventRegs = state.eventRegs.filter(x => x !== id);
      saveState();
      renderAdminTab('events');
      toast('Event deleted', 'success');
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
      <div class="field checkbox"><input id="editEventFeedback" type="checkbox" ${event.feedbackPoll?.enabled ? 'checked' : ''}><label for="editEventFeedback">Collect verified campus student feedback for this event</label></div>
      <div class="card-actions"><button class="btn btn-primary" type="submit">Save changes</button><button class="btn btn-outline" type="button" data-close-modal>Cancel</button></div>
    </form>
  `);
  $('#editEventForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!requireAdminAction()) return;
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
    saveState();
    closeModal();
    renderAdminTab('events');
    toast('Event updated', 'success');
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
  $$('button[data-approve]').forEach(b => b.addEventListener('click', () => {
    if (!requireAdminAction()) return;
    const i = state.lostfound.find(x => x.id === b.dataset.approve);
    if (i) { i.approved = true; saveState(); renderAdminTab('lostfound'); toast('Approved', 'success'); }
  }));
  $$('button[data-unapprove]').forEach(b => b.addEventListener('click', () => {
    if (!requireAdminAction()) return;
    const i = state.lostfound.find(x => x.id === b.dataset.unapprove);
    if (i) { i.approved = false; saveState(); renderAdminTab('lostfound'); toast('Hidden from public'); }
  }));
  $$('button[data-del-lf]').forEach(b => b.addEventListener('click', () => {
    if (!requireAdminAction()) return;
    if (!confirm('Delete this post?')) return;
    state.lostfound = state.lostfound.filter(x => x.id !== b.dataset.delLf);
    saveState();
    renderAdminTab('lostfound');
    toast('Deleted', 'success');
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
      📅 ${escapeHtml(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}
      ${ev.location ? ' · 📍 ' + escapeHtml(ev.location) : ''}
    </p>
    <p class="muted small mb-1">
      Please fill in your details to confirm your spot.
    </p>

    <form id="eventRegForm" class="form">
      <div class="field">
        <label for="erName">Full name *</label>
        <input id="erName" type="text" required placeholder="Your full name">
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
        <input id="erDept" type="text" required placeholder="e.g. BCA, 4th semester">
      </div>
      <div class="field">
        <label for="erNotes">Anything we should know? (optional)</label>
        <textarea id="erNotes" rows="2" placeholder="Dietary needs, accessibility, etc."></textarea>
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

function handleEventRegisterSubmit(e, eventId) {
  e.preventDefault();
  if (!hasCampusAccess()) {
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

  ev.registrations.push({
    id: uid('reg'),
    name, email, phone, dept, notes,
    date: nowISO(),
  });
  if (!state.eventRegs.includes(eventId)) state.eventRegs.push(eventId);
  saveState();

  result.innerHTML = `
    <div class="alert alert-success">
      ✅ You're registered, <strong>${escapeHtml(name)}</strong>!
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

function handleEventFeedbackSubmit(event) {
  event.preventDefault();
  if (!hasCampusAccess()) {
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
  responses.push({
    userId: currentUser.uid,
    choice,
    suggestion,
    submittedAt: nowISO(),
  });
  saveState();
  renderEvents();
  toast('Your event feedback has been sent.', 'success');
}

/* ============================================================
   LOST & FOUND SUBMIT
   ============================================================ */
async function handleLostFoundSubmit(e) {
  e.preventDefault();
  if (!hasCampusAccess()) {
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

  const submit = $('#lostFoundForm button[type="submit"]');
  submit.disabled = true;
  try {
    const item = {
      id: uid('lf'),
      type: $('#lfType').value,
      title: $('#lfTitle').value.trim(),
      location: $('#lfLocation').value.trim(),
      contact,
      description: $('#lfDesc').value.trim(),
      ...(file ? { photo: await readImageAsDataUrl(file) } : {}),
      date: nowISO(),
      approved: true,
    };
    state.lostfound.push(item);
    if (!saveState()) {
      state.lostfound.pop();
      return;
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : 'The item photo could not be added.', 'error');
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

  /* ---- Navigation clicks ---- */
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-page]');
    if (nav) {
      e.preventDefault();
      if (nav.matches('.announcement-link')) nav.remove();
      navigate(nav.dataset.page);
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