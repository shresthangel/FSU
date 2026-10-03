import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase'

export type SupportStatus = 'Received' | 'In progress' | 'Solved'

export type EventRecord = {
  id: string
  title: string
  description: string
  location: string
  startAt: string
  endAt: string
  published: boolean
  createdAt: string
}

export type EventInput = Omit<EventRecord, 'id' | 'createdAt'>

export type EventRegistration = {
  uid: string
  name: string
  email: string
  phone: string
  department: string
  notes: string
  registeredAt: string
}

export type SupportThread = {
  id: string
  ownerUid: string
  category: string
  status: SupportStatus
  assignedTo: string | null
  lastMessage: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

export type SupportMessage = {
  id: string
  senderUid: string
  body: string
  createdAt: string
}

export type PollRecord = {
  id: string
  question: string
  options: { id: string; label: string }[]
  active: boolean
  results: Record<string, number>
  createdAt: string
}

export type OpportunityKind = 'scholarship' | 'internship' | 'training' | 'competition' | 'resource'

export type OpportunityRecord = {
  id: string
  title: string
  description: string
  type: OpportunityKind
  url: string
  published: boolean
  createdAt: string
}

export type LostFoundRecord = {
  id: string
  ownerUid: string
  itemName: string
  kind: 'lost' | 'found'
  location: string
  contactName: string
  contactEmail: string
  contactPhone: string
  description: string
  photoPath: string | null
  photoUrl: string | null
  approved: boolean
  createdAt: string
}

export type GalleryRecord = {
  id: string
  caption: string
  storagePath: string
  downloadUrl: string
  createdAt: string
}

const requireDb = () => {
  if (!db) throw new Error('Firebase is not configured. Add the Firebase environment variables and restart the app.')
  return db
}

const dateFrom = (value: unknown): string =>
  value instanceof Timestamp ? value.toDate().toISOString() : ''

const subscribeRecords = <T>(
  path: string,
  parse: (id: string, data: Record<string, unknown>) => T,
  constraints: QueryConstraint[],
  onRecords: (records: T[]) => void,
  onError: (error: Error) => void,
): Unsubscribe => onSnapshot(
  query(collection(requireDb(), path), ...constraints),
  (snapshot) => onRecords(snapshot.docs.map((item) => parse(item.id, item.data({ serverTimestamps: 'estimate' })))),
  onError,
)

const createdAtOrder = orderBy('createdAt', 'desc')

const parseEvent = (id: string, data: Record<string, unknown>): EventRecord => ({
  id,
  title: String(data.title ?? ''),
  description: String(data.description ?? ''),
  location: String(data.location ?? ''),
  startAt: dateFrom(data.startAt),
  endAt: dateFrom(data.endAt),
  published: data.published === true,
  createdAt: dateFrom(data.createdAt),
})

export const subscribeEvents = (admin: boolean, onData: (events: EventRecord[]) => void, onError: (error: Error) => void) =>
  subscribeRecords(
    'events',
    parseEvent,
    admin ? [orderBy('startAt', 'asc')] : [where('published', '==', true), orderBy('startAt', 'asc')],
    (events) => onData(admin ? events : events.filter((event) => Date.parse(event.startAt) > Date.now())),
    onError,
  )

export const saveEvent = async (event: EventInput, eventId?: string) => {
  const database = requireDb()
  const values = {
    ...event,
    startAt: Timestamp.fromDate(new Date(event.startAt)),
    endAt: Timestamp.fromDate(new Date(event.endAt)),
    updatedAt: serverTimestamp(),
  }
  if (eventId) await updateDoc(doc(database, 'events', eventId), values)
  else await addDoc(collection(database, 'events'), { ...values, createdAt: serverTimestamp() })
}

export const removeEvent = (eventId: string) => deleteDoc(doc(requireDb(), 'events', eventId))

export const getEventRegistrations = async (eventId: string): Promise<EventRegistration[]> => {
  const snapshot = await getDocs(collection(requireDb(), 'events', eventId, 'registrations'))
  return snapshot.docs.map((registration) => {
    const data = registration.data()
    return {
      uid: registration.id,
      name: String(data.name ?? ''),
      email: String(data.email ?? ''),
      phone: String(data.phone ?? ''),
      department: String(data.department ?? ''),
      notes: String(data.notes ?? ''),
      registeredAt: dateFrom(data.registeredAt),
    }
  })
}

export const subscribeEventRegistrations = (
  eventId: string,
  onData: (registrations: EventRegistration[]) => void,
  onError: (error: Error) => void,
): Unsubscribe => onSnapshot(
  query(collection(requireDb(), 'events', eventId, 'registrations'), orderBy('registeredAt', 'desc')),
  (snapshot) => onData(snapshot.docs.map((registration) => {
    const data = registration.data({ serverTimestamps: 'estimate' })
    return {
      uid: registration.id,
      name: String(data.name ?? ''),
      email: String(data.email ?? ''),
      phone: String(data.phone ?? ''),
      department: String(data.department ?? ''),
      notes: String(data.notes ?? ''),
      registeredAt: dateFrom(data.registeredAt),
    }
  })),
  onError,
)

export const registerForEvent = async (
  eventId: string,
  uid: string,
  attendee: Omit<EventRegistration, 'uid' | 'registeredAt'>,
) => {
  const database = requireDb()
  const eventRef = doc(database, 'events', eventId)
  const registrationRef = doc(database, 'events', eventId, 'registrations', uid)
  await runTransaction(database, async (transaction) => {
    const [eventSnapshot, registrationSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(registrationRef),
    ])
    if (!eventSnapshot.exists() || eventSnapshot.data().published !== true) throw new Error('This event is not open for registration.')
    if (registrationSnapshot.exists()) throw new Error('You are already registered for this event.')
    const startAt = eventSnapshot.data().startAt
    if (startAt instanceof Timestamp && startAt.toMillis() <= Date.now()) throw new Error('Registration is closed because this event has started.')
    transaction.set(registrationRef, { ...attendee, registeredAt: serverTimestamp() })
  })
}

const parseThread = (id: string, data: Record<string, unknown>): SupportThread => ({
  id,
  ownerUid: String(data.ownerUid ?? ''),
  category: String(data.category ?? ''),
  status: (data.status === 'In progress' || data.status === 'Solved' ? data.status : 'Received'),
  assignedTo: typeof data.assignedTo === 'string' ? data.assignedTo : null,
  lastMessage: String(data.lastMessage ?? ''),
  createdAt: dateFrom(data.createdAt),
  updatedAt: dateFrom(data.updatedAt),
  lastMessageAt: dateFrom(data.lastMessageAt),
})

export const subscribeSupportThreads = (uid: string, admin: boolean, onData: (threads: SupportThread[]) => void, onError: (error: Error) => void) =>
  subscribeRecords('supportThreads', parseThread, admin ? [orderBy('updatedAt', 'desc')] : [where('ownerUid', '==', uid), orderBy('updatedAt', 'desc')], onData, onError)

export const subscribeSupportMessages = (threadId: string, onData: (messages: SupportMessage[]) => void, onError: (error: Error) => void) =>
  onSnapshot(
    query(collection(requireDb(), 'supportThreads', threadId, 'messages'), orderBy('createdAt', 'asc')),
    (snapshot) => onData(snapshot.docs.map((item) => {
      const data = item.data({ serverTimestamps: 'estimate' })
      return { id: item.id, senderUid: String(data.senderUid ?? ''), body: String(data.body ?? ''), createdAt: dateFrom(data.createdAt) }
    })),
    onError,
  )

export const createSupportThread = async (uid: string, category: string, body: string) => {
  const database = requireDb()
  const threadRef = doc(collection(database, 'supportThreads'))
  const messageRef = doc(collection(threadRef, 'messages'))
  const batch = writeBatch(database)
  const now = serverTimestamp()
  batch.set(threadRef, {
    ownerUid: uid,
    category,
    status: 'Received',
    assignedTo: null,
    lastMessage: body,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  })
  batch.set(messageRef, { senderUid: uid, body, createdAt: now })
  await batch.commit()
  return threadRef.id
}

export const sendSupportReply = async (threadId: string, uid: string, body: string) => {
  const database = requireDb()
  const threadRef = doc(database, 'supportThreads', threadId)
  const messageRef = doc(collection(threadRef, 'messages'))
  const batch = writeBatch(database)
  const now = serverTimestamp()
  batch.set(messageRef, { senderUid: uid, body, createdAt: now })
  batch.update(threadRef, { lastMessage: body, updatedAt: now, lastMessageAt: now })
  await batch.commit()
}

export const updateSupportThread = (threadId: string, status: SupportStatus, assignedTo: string | null) =>
  updateDoc(doc(requireDb(), 'supportThreads', threadId), { status, assignedTo, updatedAt: serverTimestamp() })

const parsePoll = (id: string, data: Record<string, unknown>): PollRecord => ({
  id,
  question: String(data.question ?? ''),
  options: Array.isArray(data.options) ? data.options.filter((option): option is { id: string; label: string } =>
    typeof option === 'object' && option !== null
      && typeof (option as Record<string, unknown>).id === 'string'
      && typeof (option as Record<string, unknown>).label === 'string') : [],
  active: data.active === true,
  results: typeof data.results === 'object' && data.results !== null ? data.results as Record<string, number> : {},
  createdAt: dateFrom(data.createdAt),
})

export const subscribePolls = (admin: boolean, onData: (polls: PollRecord[]) => void, onError: (error: Error) => void) =>
  subscribeRecords('polls', parsePoll, admin ? [createdAtOrder] : [where('active', '==', true), createdAtOrder], onData, onError)

export const hasVoted = async (pollId: string, uid: string) =>
  (await getDoc(doc(requireDb(), 'polls', pollId, 'votes', uid))).exists()

export const voteInPoll = async (pollId: string, uid: string, optionId: string) => {
  const database = requireDb()
  const pollRef = doc(database, 'polls', pollId)
  const voteRef = doc(database, 'polls', pollId, 'votes', uid)
  await runTransaction(database, async (transaction) => {
    const [pollSnapshot, voteSnapshot] = await Promise.all([transaction.get(pollRef), transaction.get(voteRef)])
    if (!pollSnapshot.exists() || pollSnapshot.data().active !== true) throw new Error('This poll is closed.')
    if (voteSnapshot.exists()) throw new Error('You have already voted in this poll.')
    const poll = parsePoll(pollSnapshot.id, pollSnapshot.data())
    if (!poll.options.some((option) => option.id === optionId)) throw new Error('Choose one of the listed poll options.')
    transaction.set(voteRef, { optionId, createdAt: serverTimestamp() })
    transaction.update(pollRef, {
      results: { ...poll.results, [optionId]: (poll.results[optionId] ?? 0) + 1 },
      updatedAt: serverTimestamp(),
    })
  })
}

export const createPoll = async (question: string, optionLabels: string[]) => {
  const options = optionLabels.map((label) => ({ id: crypto.randomUUID(), label }))
  const results = Object.fromEntries(options.map(({ id }) => [id, 0]))
  await addDoc(collection(requireDb(), 'polls'), {
    question,
    options,
    results,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export const removePoll = (pollId: string) => deleteDoc(doc(requireDb(), 'polls', pollId))

const parseOpportunity = (id: string, data: Record<string, unknown>): OpportunityRecord => ({
  id,
  title: String(data.title ?? ''),
  description: String(data.description ?? ''),
  type: (['scholarship', 'internship', 'training', 'competition', 'resource'].includes(String(data.type)) ? data.type : 'resource') as OpportunityKind,
  url: String(data.url ?? ''),
  published: data.published === true,
  createdAt: dateFrom(data.createdAt),
})

export const subscribeOpportunities = (admin: boolean, onData: (items: OpportunityRecord[]) => void, onError: (error: Error) => void) =>
  subscribeRecords('opportunities', parseOpportunity, admin ? [createdAtOrder] : [where('published', '==', true), createdAtOrder], onData, onError)

export const saveOpportunity = async (item: Omit<OpportunityRecord, 'id' | 'createdAt'>, id?: string) => {
  const database = requireDb()
  if (id) await updateDoc(doc(database, 'opportunities', id), { ...item, updatedAt: serverTimestamp() })
  else await addDoc(collection(database, 'opportunities'), { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

export const removeOpportunity = (id: string) => deleteDoc(doc(requireDb(), 'opportunities', id))

export const validateImageFile = async (file: File) => {
  const maxBytes = 5 * 1024 * 1024
  const extension = file.name.match(/\.(jpe?g|png|webp)$/i)?.[1].toLowerCase()
  const matchesDeclaredFormat = (file.type === 'image/jpeg' && (extension === 'jpg' || extension === 'jpeg'))
    || (file.type === 'image/png' && extension === 'png')
    || (file.type === 'image/webp' && extension === 'webp')
  if (!matchesDeclaredFormat) {
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  }
  if (file.size === 0 || file.size > maxBytes) throw new Error('Images must be between 1 byte and 5 MB.')

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const hasMatchingSignature = file.type === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png'
      ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!hasMatchingSignature) throw new Error('The file contents do not match the declared image format.')

  const bitmap = await createImageBitmap(file)
  const tooLarge = bitmap.width * bitmap.height > 25_000_000
  bitmap.close()
  if (tooLarge) throw new Error('Images must be no larger than 25 megapixels.')
}

const uploadPortalImage = async (file: File, storagePath: string) => {
  await validateImageFile(file)
  if (!storage) throw new Error('Firebase Storage is not configured.')
  const imageRef = ref(storage, storagePath)
  await uploadBytes(imageRef, file, { contentType: file.type })
  return { storagePath, downloadUrl: await getDownloadURL(imageRef) }
}

const parseLostFound = (id: string, data: Record<string, unknown>): LostFoundRecord => ({
  id,
  ownerUid: String(data.ownerUid ?? ''),
  itemName: String(data.itemName ?? ''),
  kind: data.kind === 'found' ? 'found' : 'lost',
  location: String(data.location ?? ''),
  contactName: String(data.contactName ?? ''),
  contactEmail: String(data.contactEmail ?? ''),
  contactPhone: String(data.contactPhone ?? ''),
  description: String(data.description ?? ''),
  photoPath: typeof data.photoPath === 'string' ? data.photoPath : null,
  photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
  approved: data.approved === true,
  createdAt: dateFrom(data.createdAt),
})

export const subscribeLostFound = (admin: boolean, uid: string, onData: (items: LostFoundRecord[]) => void, onError: (error: Error) => void) =>
  subscribeRecords(
    'lostFound',
    parseLostFound,
    admin ? [createdAtOrder] : uid ? [where('approved', '==', true), createdAtOrder] : [where('approved', '==', true), createdAtOrder],
    onData,
    onError,
  )

export const createLostFoundPost = async (
  uid: string,
  post: Omit<LostFoundRecord, 'id' | 'ownerUid' | 'photoPath' | 'photoUrl' | 'approved' | 'createdAt'>,
  file?: File,
) => {
  const database = requireDb()
  const itemRef = doc(collection(database, 'lostFound'))
  let image: { storagePath: string; downloadUrl: string } | null = null
  if (file) image = await uploadPortalImage(file, `lostFound/${uid}/${itemRef.id}`)
  try {
    await setDoc(itemRef, {
      ...post,
      ownerUid: uid,
      photoPath: image?.storagePath ?? null,
      photoUrl: image?.downloadUrl ?? null,
      approved: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    if (image && storage) await deleteObject(ref(storage, image.storagePath))
    throw error
  }
}

export const moderateLostFound = (id: string, approved: boolean) =>
  updateDoc(doc(requireDb(), 'lostFound', id), { approved, updatedAt: serverTimestamp() })

export const removeLostFound = async (item: LostFoundRecord) => {
  await deleteDoc(doc(requireDb(), 'lostFound', item.id))
  if (item.photoPath && storage) await deleteObject(ref(storage, item.photoPath))
}

const parseGallery = (id: string, data: Record<string, unknown>): GalleryRecord => ({
  id,
  caption: String(data.caption ?? ''),
  storagePath: String(data.storagePath ?? ''),
  downloadUrl: String(data.downloadUrl ?? ''),
  createdAt: dateFrom(data.createdAt),
})

export const subscribeGallery = (onData: (items: GalleryRecord[]) => void, onError: (error: Error) => void) =>
  subscribeRecords('gallery', parseGallery, [createdAtOrder], onData, onError)

export const addGalleryPhoto = async (file: File, caption: string, uid: string) => {
  const database = requireDb()
  const galleryRef = doc(collection(database, 'gallery'))
  const image = await uploadPortalImage(file, `gallery/${uid}/${galleryRef.id}`)
  try {
    await setDoc(galleryRef, { caption, ...image, createdAt: serverTimestamp() })
  } catch (error) {
    if (storage) await deleteObject(ref(storage, image.storagePath))
    throw error
  }
}

export const removeGalleryPhoto = async (item: GalleryRecord) => {
  await deleteDoc(doc(requireDb(), 'gallery', item.id))
  if (item.storagePath && storage) await deleteObject(ref(storage, item.storagePath))
}
