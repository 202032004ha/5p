import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { connectDatabaseEmulator, get, getDatabase, onValue, ref, serverTimestamp, set, update } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.mjs';
import { nicknameKey } from './model.mjs?v=2';

const emulator = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '5510';
const app = initializeApp(emulator ? {
  projectId: 'demo-jaraeng',
  apiKey: 'demo-local',
  databaseURL: 'https://demo-jaraeng-default-rtdb.firebaseio.com',
} : firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

if (emulator) {
  connectAuthEmulator(auth, `http://${location.hostname}:9299`, { disableWarnings: true });
  connectDatabaseEmulator(db, location.hostname, 9500);
}

let session;
export function connect() {
  if (!session) {
    session = auth.authStateReady()
      .then(async () => auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid)
      .catch((error) => {
        session = undefined;
        throw error;
      });
  }
  return session;
}

export function watchConnection(onChange) {
  return onValue(ref(db, '.info/connected'), (snapshot) => onChange(snapshot.val() === true));
}

export function waitForConnection() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error('Database connection timeout'));
    }, 12000);
    const stop = watchConnection((online) => {
      if (!online) return;
      clearTimeout(timer);
      queueMicrotask(() => stop());
      resolve();
    });
  });
}

export function watchClock(onChange) {
  return onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => onChange(snapshot.val() ?? 0));
}

export function watchRoom(id, onChange, onError) {
  return onValue(ref(db, `rooms/${id}`), (snapshot) => onChange(snapshot.val()), onError);
}

function newMember(nickname, status) {
  return { nickname, joinedAt: serverTimestamp(), updatedAt: serverTimestamp(), status };
}

export function createRoom(id, uid, nickname, startTime) {
  return set(ref(db, `rooms/${id}`), {
    settings: { hostId: uid, startTime },
    members: { [uid]: newMember(nickname, 'yes') },
    nicknames: { [nicknameKey(nickname)]: uid },
  });
}

export async function joinRoom(id, uid, nickname) {
  const roomRef = ref(db, `rooms/${id}`);
  const key = nicknameKey(nickname);
  try {
    await update(roomRef, {
      [`members/${uid}`]: newMember(nickname, 'no'),
      [`nicknames/${key}`]: uid,
    });
    return true;
  } catch (error) {
    if (error.code !== 'PERMISSION_DENIED') throw error;
    const snapshot = await get(roomRef);
    if (snapshot.child(`members/${uid}`).exists()) return true;
    if (snapshot.child(`nicknames/${key}`).exists()) return false;
    throw error;
  }
}

export function vote(id, uid, status) {
  return update(ref(db, `rooms/${id}/members/${uid}`), { status, updatedAt: serverTimestamp() });
}

export function removeMember(id, memberId, claimedKey) {
  const changes = { [`members/${memberId}`]: null };
  if (claimedKey) changes[`nicknames/${claimedKey}`] = null;
  return update(ref(db, `rooms/${id}`), changes);
}

export function changeStartTime(id, time) {
  return set(ref(db, `rooms/${id}/settings/startTime`), time);
}
