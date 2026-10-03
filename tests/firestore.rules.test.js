import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-fsu-portal';
const adminUid = 'fsu-admin-uid';
const studentUid = 'student-uid';
const otherStudentUid = 'other-student-uid';
const requestId = 'student-request';
const accountIdentity = (uid, emailVerified = true) => ({
  email: `${uid}@example.com`,
  email_verified: emailVerified,
});
const testEnvironment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

const supportRequest = (userId = studentUid) => ({
  userId,
  studentId: `FSU-${userId}`,
  category: 'Help or guidance',
  summary: 'Test support conversation',
  status: 'Received',
  createdAt: Timestamp.now(),
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'admins', adminUid), { role: 'admin' });
    await setDoc(doc(context.firestore(), 'studentVerifications', studentUid), {
      email: `${studentUid}@example.com`,
      displayName: 'Verified Student',
      studentId: 'CCT-1001',
      status: 'approved',
      submittedAt: Timestamp.now(),
    });
    await setDoc(doc(context.firestore(), 'studentVerifications', otherStudentUid), {
      email: `${otherStudentUid}@example.com`,
      displayName: 'Another Student',
      studentId: 'CCT-1002',
      status: 'approved',
      submittedAt: Timestamp.now(),
    });
  });
});

after(async () => {
  await testEnvironment.cleanup();
});

test('verified admin UID with a personal email can read its role record, but cannot change it', async () => {
  const adminDb = testEnvironment.authenticatedContext(adminUid, accountIdentity(adminUid)).firestore();

  await assertSucceeds(getDoc(doc(adminDb, 'admins', adminUid)));
  await assertFails(setDoc(doc(adminDb, 'admins', adminUid), { role: 'admin' }));
});

test('verified students can create and read their own support requests only', async () => {
  const studentDb = testEnvironment.authenticatedContext(studentUid, accountIdentity(studentUid)).firestore();
  const otherStudentDb = testEnvironment.authenticatedContext(otherStudentUid, accountIdentity(otherStudentUid)).firestore();
  const requestRef = doc(studentDb, 'supportRequests', requestId);

  await assertSucceeds(setDoc(requestRef, supportRequest()));
  await assertSucceeds(getDoc(requestRef));
  await assertFails(getDoc(doc(otherStudentDb, 'supportRequests', requestId)));
  await assertFails(getDocs(collection(studentDb, 'supportRequests')));
});

test('verified admins can list support requests while students cannot', async () => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'supportRequests', requestId), supportRequest());
  });
  const adminDb = testEnvironment.authenticatedContext(adminUid, accountIdentity(adminUid)).firestore();
  const studentDb = testEnvironment.authenticatedContext(studentUid, accountIdentity(studentUid)).firestore();

  await assertSucceeds(getDocs(collection(adminDb, 'supportRequests')));
  await assertFails(getDocs(collection(studentDb, 'supportRequests')));
});

test('student messages and admin replies are readable only within the owned thread', async () => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'supportRequests', requestId), supportRequest());
  });
  const studentDb = testEnvironment.authenticatedContext(studentUid, accountIdentity(studentUid)).firestore();
  const adminDb = testEnvironment.authenticatedContext(adminUid, accountIdentity(adminUid)).firestore();
  const otherStudentDb = testEnvironment.authenticatedContext(otherStudentUid, accountIdentity(otherStudentUid)).firestore();
  const studentMessage = {
    senderId: studentUid,
    senderRole: 'student',
    body: 'Student test message',
    createdAt: Timestamp.now(),
  };
  const adminReply = {
    senderId: adminUid,
    senderRole: 'admin',
    body: 'Admin test reply',
    createdAt: Timestamp.now(),
  };
  const messages = db => collection(db, 'supportRequests', requestId, 'messages');

  await assertSucceeds(addDoc(messages(studentDb), studentMessage));
  await assertSucceeds(addDoc(messages(adminDb), adminReply));
  await assertSucceeds(getDocs(messages(studentDb)));
  await assertFails(getDocs(messages(otherStudentDb)));
  await assertFails(addDoc(messages(otherStudentDb), {
    ...studentMessage,
    senderId: otherStudentUid,
  }));
});

test('only admins can update support status and assignment', async () => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'supportRequests', requestId), supportRequest());
  });
  const adminDb = testEnvironment.authenticatedContext(adminUid, accountIdentity(adminUid)).firestore();
  const studentDb = testEnvironment.authenticatedContext(studentUid, accountIdentity(studentUid)).firestore();
  const requestRef = doc(adminDb, 'supportRequests', requestId);

  await assertSucceeds(updateDoc(requestRef, {
    status: 'In progress',
    assignedTo: 'FSU team',
    updatedAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(doc(studentDb, 'supportRequests', requestId), {
    status: 'Solved',
    updatedAt: Timestamp.now(),
  }));
});

test('unverified accounts cannot access admin or support records', async () => {
  const unverifiedDb = testEnvironment.authenticatedContext(adminUid, accountIdentity(adminUid, false)).firestore();

  await assertFails(getDoc(doc(unverifiedDb, 'admins', adminUid)));
  await assertFails(setDoc(doc(unverifiedDb, 'supportRequests', requestId), supportRequest()));
});

test('verified email accounts can submit student IDs, but need admin approval for portal access', async () => {
  const applicantUid = 'new-applicant';
  const applicantDb = testEnvironment.authenticatedContext(
    applicantUid,
    accountIdentity(applicantUid),
  ).firestore();
  const adminDb = testEnvironment.authenticatedContext(adminUid, accountIdentity(adminUid)).firestore();
  const verificationRef = doc(applicantDb, 'studentVerifications', applicantUid);

  await assertSucceeds(setDoc(verificationRef, {
    email: `${applicantUid}@example.com`,
    displayName: 'New Applicant',
    studentId: 'CCT-2001',
    status: 'pending',
    submittedAt: Timestamp.now(),
  }));
  await assertSucceeds(getDoc(verificationRef));
  await assertFails(setDoc(
    doc(applicantDb, 'supportRequests', 'before-approval'),
    supportRequest(applicantUid),
  ));
  await assertFails(getDoc(doc(applicantDb, 'users', applicantUid)));
  await assertFails(updateDoc(verificationRef, { status: 'approved' }));

  await assertSucceeds(updateDoc(doc(adminDb, 'studentVerifications', applicantUid), {
    status: 'approved',
    reviewedAt: Timestamp.now(),
    reviewedBy: adminUid,
  }));
  await assertSucceeds(setDoc(
    doc(applicantDb, 'supportRequests', 'after-approval'),
    supportRequest(applicantUid),
  ));
});

test('admins can list verification requests and students cannot', async () => {
  const adminDb = testEnvironment.authenticatedContext(adminUid, accountIdentity(adminUid)).firestore();
  const studentDb = testEnvironment.authenticatedContext(studentUid, accountIdentity(studentUid)).firestore();
  const requests = collection(adminDb, 'studentVerifications');

  await assertSucceeds(getDocs(requests));
  await assertFails(getDocs(collection(studentDb, 'studentVerifications')));
});

test('rejected students can correct and resubmit their ID, but cannot approve themselves', async () => {
  const applicantUid = 'rejected-applicant';
  const applicantDb = testEnvironment.authenticatedContext(
    applicantUid,
    accountIdentity(applicantUid),
  ).firestore();
  const verificationRef = doc(applicantDb, 'studentVerifications', applicantUid);
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'studentVerifications', applicantUid), {
      email: `${applicantUid}@example.com`,
      displayName: 'Applicant',
      studentId: 'CCT-OLD',
      status: 'rejected',
      submittedAt: Timestamp.now(),
      reviewedAt: Timestamp.now(),
      reviewedBy: adminUid,
    });
  });

  await assertSucceeds(setDoc(verificationRef, {
    email: `${applicantUid}@example.com`,
    displayName: 'Applicant',
    studentId: 'CCT-CORRECTED',
    status: 'pending',
    submittedAt: Timestamp.now(),
  }, { merge: true }));
  await assertFails(updateDoc(verificationRef, { status: 'approved' }));
});

test('email ownership must be verified before a student ID can be submitted', async () => {
  const unverifiedUid = 'unverified-applicant';
  const unverifiedDb = testEnvironment.authenticatedContext(
    unverifiedUid,
    accountIdentity(unverifiedUid, false),
  ).firestore();

  await assertFails(setDoc(doc(unverifiedDb, 'studentVerifications', unverifiedUid), {
    email: `${unverifiedUid}@example.com`,
    displayName: 'Unverified Applicant',
    studentId: 'CCT-2002',
    status: 'pending',
    submittedAt: Timestamp.now(),
  }));
});
