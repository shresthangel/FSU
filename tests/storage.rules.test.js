import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-fsu-portal';
const adminUid = 'verified-admin';
const studentUid = 'approved-student';
const unapprovedUid = 'unapproved-student';
const otherUid = 'another-student';
const image = new Uint8Array([137, 80, 78, 71]);
let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'admins', adminUid), { role: 'admin' });
    await setDoc(doc(firestore, 'studentVerifications', studentUid), { status: 'approved' });
    await setDoc(doc(firestore, 'studentVerifications', unapprovedUid), { status: 'pending' });
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

function signedInStorage(uid, emailVerified = true) {
  return testEnvironment.authenticatedContext(uid, { email_verified: emailVerified }).storage();
}

test('verified admins can upload gallery, notice, and event images', async () => {
  const storage = signedInStorage(adminUid);
  await assertSucceeds(uploadBytes(ref(storage, 'gallery/gallery-1.png'), image, {
    contentType: 'image/png',
  }));
  await assertSucceeds(uploadBytes(ref(storage, 'notices/notice-1/image-notice.png'), image, {
    contentType: 'image/png',
  }));
  await assertSucceeds(uploadBytes(ref(storage, 'events/event-1/image-event.png'), image, {
    contentType: 'image/png',
  }));
});

test('non-admins and unverified accounts cannot upload admin images', async () => {
  await assertFails(uploadBytes(ref(signedInStorage(studentUid), 'gallery/photo.png'), image, {
    contentType: 'image/png',
  }));
  await assertFails(uploadBytes(ref(signedInStorage(adminUid, false), 'gallery/photo.png'), image, {
    contentType: 'image/png',
  }));
});

test('approved students can upload only their own Lost & Found images', async () => {
  const storage = signedInStorage(studentUid);
  await assertSucceeds(uploadBytes(
    ref(storage, `lostFound/${studentUid}/post-1/photo.png`),
    image,
    { contentType: 'image/png' },
  ));
  await assertFails(uploadBytes(
    ref(storage, `lostFound/${otherUid}/post-2/photo.png`),
    image,
    { contentType: 'image/png' },
  ));
  await assertFails(uploadBytes(
    ref(signedInStorage(unapprovedUid), `lostFound/${unapprovedUid}/post-3/photo.png`),
    image,
    { contentType: 'image/png' },
  ));
});
