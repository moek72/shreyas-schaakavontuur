import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { connectPlayer, db, firebaseReady } from './firebase.js'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode() {
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export async function createRoom(fen, playerName) {
  if (!firebaseReady) throw new Error('Firebase is nog niet ingesteld.')
  const user = await connectPlayer()
  const code = makeRoomCode()
  await setDoc(doc(db, 'games', code), {
    fen,
    hostId: user.uid,
    hostName: playerName,
    guestId: null,
    guestName: null,
    status: 'waiting',
    updatedAt: serverTimestamp(),
  })
  return { code, color: 'w', userId: user.uid }
}

export async function joinRoom(code, playerName) {
  if (!firebaseReady) throw new Error('Firebase is nog niet ingesteld.')
  const user = await connectPlayer()
  const roomRef = doc(db, 'games', code)
  const room = await getDoc(roomRef)
  if (!room.exists()) throw new Error('Deze speelkamer bestaat niet.')
  const data = room.data()
  if (data.guestId && data.guestId !== user.uid) throw new Error('Deze speelkamer is al vol.')
  await updateDoc(roomRef, {
    guestId: user.uid,
    guestName: playerName,
    status: 'playing',
    updatedAt: serverTimestamp(),
  })
  return { code, color: 'b', userId: user.uid, fen: data.fen }
}

export async function saveMove(code, fen) {
  await updateDoc(doc(db, 'games', code), { fen, updatedAt: serverTimestamp() })
}

export function watchRoom(code, callback, onError) {
  return onSnapshot(doc(db, 'games', code), (snapshot) => {
    if (snapshot.exists()) callback(snapshot.data())
  }, onError)
}
