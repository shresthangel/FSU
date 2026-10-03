import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

const projectId = 'demo-fsu-portal'
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8')

if (!projectId.startsWith('demo-')) {
  throw new Error('Rules tests must use a demo project ID and Firebase Emulators.')
}

let testEnv: RulesTestEnvironment

const context = (uid: string, emailVerified = true) =>
  testEnv.authenticatedContext(uid, { email_verified: emailVerified })

async function seedAdmin(uid: string, role = 'admin') {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    await setDoc(doc(adminContext.firestore(), 'admins', uid), { role })
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: firestoreRules,
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: storageRules,
    },
  })
}, 30_000)

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
})

afterAll(async () => {
  if (testEnv) await testEnv.cleanup()
})

describe('Firestore security rules', () => {
  it('uses the authenticated UID and role field for admin authorization', async () => {
    await seedAdmin('admin-user')
    await seedAdmin('wrong-role-user', 'editor')

    const adminDb = context('admin-user').firestore()
    const wrongRoleDb = context('wrong-role-user').firestore()
    const ownRole = await getDoc(doc(adminDb, 'admins/admin-user'))
    expect(ownRole.data()?.role).toBe('admin')
    await assertFails(setDoc(doc(adminDb, 'admins/admin-user'), { role: 'editor' }))
    await assertFails(deleteDoc(doc(adminDb, 'admins/admin-user')))
    await assertFails(setDoc(doc(adminDb, 'admins/new-user'), { role: 'admin' }))

    const notice = {
      title: 'Notice',
      body: 'Public notice',
      category: 'general',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await assertSucceeds(setDoc(doc(adminDb, 'notices/n1'), notice))
    await assertFails(setDoc(doc(wrongRoleDb, 'notices/n2'), notice))
  })

  it('denies unverified users private and privileged creates', async () => {
    await seedAdmin('admin-user')
    const unverifiedDb = context('unverified-user', false).firestore()
    const unverifiedAdminDb = context('admin-user', false).firestore()

    await assertFails(setDoc(doc(unverifiedDb, 'supportThreads/private-thread'), {
      ownerUid: 'unverified-user',
      category: 'question',
      status: 'Received',
      assignedTo: null,
      lastMessage: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(unverifiedAdminDb, 'notices/unverified-admin'), {
      title: 'Not allowed',
      body: 'Not allowed',
      category: 'general',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
  })

  it('keeps support threads and messages private to their verified owner and admins', async () => {
    await seedAdmin('admin-user')
    const ownerDb = context('thread-owner').firestore()
    const outsiderDb = context('unrelated-user').firestore()
    const adminDb = context('admin-user').firestore()
    const thread = doc(ownerDb, 'supportThreads/private-thread')

    await assertSucceeds(setDoc(thread, {
      ownerUid: 'thread-owner',
      category: 'account',
      status: 'Received',
      assignedTo: null,
      lastMessage: 'I need help',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    }))
    const message = {
      senderUid: 'thread-owner',
      body: 'I need help',
      createdAt: serverTimestamp(),
    }
    await assertSucceeds(setDoc(doc(thread, 'messages/first'), message))
    await assertSucceeds(getDoc(thread))
    await assertSucceeds(getDoc(doc(thread, 'messages/first')))
    await assertSucceeds(getDoc(doc(adminDb, 'supportThreads/private-thread')))
    await assertFails(getDoc(doc(outsiderDb, 'supportThreads/private-thread')))
    await assertFails(getDoc(doc(outsiderDb, 'supportThreads/private-thread/messages/first')))

    await assertSucceeds(updateDoc(thread, {
      status: 'In progress',
      assignedTo: 'admin-user',
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(adminDb, 'supportThreads/private-thread/messages/admin-reply'), {
      senderUid: 'admin-user',
      body: 'We are looking into this.',
      createdAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(thread, {
      status: 'Solved',
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    }))
  })

  it('allows one event registration at the user UID document only', async () => {
    await seedAdmin('admin-user')
    const adminDb = context('admin-user').firestore()
    const ownerDb = context('event-user').firestore()
    await setDoc(doc(adminDb, 'events/e1'), {
      title: 'Campus fair',
      description: 'An event',
      location: 'Main hall',
      startAt: Timestamp.fromDate(new Date('2027-01-01T10:00:00Z')),
      endAt: Timestamp.fromDate(new Date('2027-01-01T12:00:00Z')),
      published: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const registration = {
      name: 'A Student',
      email: 'student@example.edu',
      phone: '555-0100',
      department: 'Computing',
      notes: '',
      registeredAt: serverTimestamp(),
    }
    const ownRegistration = doc(ownerDb, 'events/e1/registrations/event-user')
    await assertSucceeds(setDoc(ownRegistration, registration))
    await assertSucceeds(getDoc(ownRegistration))
    await assertFails(setDoc(ownRegistration, registration))
    await assertFails(setDoc(doc(ownerDb, 'events/e1/registrations/someone-else'), registration))
    await assertFails(getDocs(collection(ownerDb, 'events/e1/registrations')))
  })

  it('requires an atomic one-time poll vote and matching counter increment', async () => {
    await seedAdmin('admin-user')
    const adminDb = context('admin-user').firestore()
    await setDoc(doc(adminDb, 'polls/p1'), {
      question: 'Which option?',
      options: ['yes', 'no'],
      active: true,
      results: { yes: 0, no: 0 },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const voterDb = context('poll-voter').firestore()
    const voteRef = doc(voterDb, 'polls/p1/votes/poll-voter')
    const pollRef = doc(voterDb, 'polls/p1')
    const firstVote = writeBatch(voterDb)
    firstVote.set(voteRef, { optionId: 'yes', createdAt: serverTimestamp() })
    firstVote.update(pollRef, {
      results: { yes: 1, no: 0 },
      updatedAt: serverTimestamp(),
    })
    await assertSucceeds(firstVote.commit())

    const duplicateVote = writeBatch(voterDb)
    duplicateVote.set(voteRef, { optionId: 'no', createdAt: serverTimestamp() })
    duplicateVote.update(pollRef, {
      results: { yes: 1, no: 1 },
      updatedAt: serverTimestamp(),
    })
    await assertFails(duplicateVote.commit())

    const anotherDb = context('another-voter').firestore()
    const arbitraryCounter = writeBatch(anotherDb)
    arbitraryCounter.update(doc(anotherDb, 'polls/p1'), {
      results: { yes: 900, no: 0 },
      updatedAt: serverTimestamp(),
    })
    await assertFails(arbitraryCounter.commit())
  })

  it('keeps pending lost-and-found posts private and restricts owner edits', async () => {
    await seedAdmin('admin-user')
    const ownerDb = context('finder').firestore()
    const outsiderDb = context('reader').firestore()
    const adminDb = context('admin-user').firestore()
    const post = doc(ownerDb, 'lostFound/post-1')
    await assertSucceeds(setDoc(post, {
      ownerUid: 'finder',
      itemName: 'Blue backpack',
      kind: 'lost',
      location: 'Library',
      contactName: 'A Finder',
      contactEmail: 'finder@example.edu',
      contactPhone: '555-0199',
      description: 'A blue backpack.',
      photoPath: 'lostFound/finder/post-1/backpack.png',
      approved: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(getDoc(post))
    await assertFails(getDoc(doc(outsiderDb, 'lostFound/post-1')))
    await assertSucceeds(updateDoc(post, {
      itemName: 'Blue backpack (updated)',
      updatedAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(post, {
      approved: true,
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(adminDb, 'lostFound/post-1'), {
      approved: true,
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(getDoc(doc(outsiderDb, 'lostFound/post-1')))
  })
})

describe('Storage security rules', () => {
  it('validates lost-and-found owner uploads and limits gallery writes to admins', async () => {
    await seedAdmin('storage-admin')
    const png = new Uint8Array([137, 80, 78, 71])
    const ownerStorage = context('photo-owner').storage()
    const otherStorage = context('other-owner').storage()
    const adminStorage = context('storage-admin').storage()

    const photoPath = 'lostFound/photo-owner/post-1/photo.png'
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, photoPath),
      png,
      { contentType: 'image/png' },
    ))
    await assertSucceeds(getDownloadURL(ref(ownerStorage, photoPath)))
    await assertFails(getDownloadURL(ref(otherStorage, photoPath)))
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await setDoc(doc(adminContext.firestore(), 'lostFound/post-1'), {
        ownerUid: 'photo-owner',
        approved: true,
      })
    })
    await assertSucceeds(getDownloadURL(ref(otherStorage, photoPath)))
    await assertFails(uploadBytes(
      ref(ownerStorage, 'lostFound/photo-owner/post-1/not-image.png'),
      png,
      { contentType: 'text/plain' },
    ))
    await assertFails(uploadBytes(
      ref(otherStorage, 'lostFound/photo-owner/post-1/forbidden.png'),
      png,
      { contentType: 'image/png' },
    ))
    await assertFails(uploadBytes(
      ref(ownerStorage, 'gallery/public.png'),
      png,
      { contentType: 'image/png' },
    ))
    await assertSucceeds(uploadBytes(
      ref(adminStorage, 'gallery/public.png'),
      png,
      { contentType: 'image/png' },
    ))
  })
})
