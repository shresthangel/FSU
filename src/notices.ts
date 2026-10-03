import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'

export type NoticeCategory = 'exam' | 'event' | 'scholarship' | 'general'

export type Notice = {
  id: string
  title: string
  body: string
  category: NoticeCategory
  createdAt: string
}

export type NoticeInput = Pick<Notice, 'title' | 'body' | 'category'>

const noticeCategories: NoticeCategory[] = ['exam', 'event', 'scholarship', 'general']

export const isNoticeCategory = (value: unknown): value is NoticeCategory =>
  typeof value === 'string' && noticeCategories.includes(value as NoticeCategory)

const parseNotice = (id: string, value: unknown): Notice | null => {
  if (typeof value !== 'object' || value === null) return null
  const notice = value as Record<string, unknown>
  if (
    typeof notice.title !== 'string'
    || typeof notice.body !== 'string'
    || !isNoticeCategory(notice.category)
    || !(notice.createdAt instanceof Timestamp)
  ) return null

  return {
    id,
    title: notice.title,
    body: notice.body,
    category: notice.category,
    createdAt: notice.createdAt.toDate().toISOString(),
  }
}

const getNoticesCollection = () => {
  if (!db) throw new Error('Firebase is not configured. Add the Firebase environment variables and restart the app.')
  return collection(db, 'notices')
}

export const subscribeToNotices = (
  onNotices: (notices: Notice[]) => void,
  onError: (error: Error) => void,
): Unsubscribe => onSnapshot(
  query(getNoticesCollection(), orderBy('createdAt', 'desc')),
  (snapshot) => {
    const notices = snapshot.docs.map((noticeDocument) =>
      parseNotice(noticeDocument.id, noticeDocument.data({ serverTimestamps: 'estimate' })))
    if (notices.some((notice) => notice === null)) {
      onError(new Error('A notice in Firestore has invalid fields. Check the notices collection data.'))
      return
    }
    onNotices(notices.filter((notice): notice is Notice => notice !== null))
  },
  (error) => onError(error),
)

export const createNotice = (notice: NoticeInput) => addDoc(getNoticesCollection(), {
  ...notice,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

export const updateNotice = (noticeId: string, notice: NoticeInput) =>
  updateDoc(doc(getNoticesCollection(), noticeId), {
    ...notice,
    updatedAt: serverTimestamp(),
  })

export const deleteNotice = (noticeId: string) => deleteDoc(doc(getNoticesCollection(), noticeId))
