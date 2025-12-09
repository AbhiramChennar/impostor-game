// ---------- CONFIG: replace with your Firebase project values ----------
const firebaseConfig = {
  apiKey: "AIzaSyAB-n2VgC8cFwS2_0XXbDXohDR1tbJmn1c",
  authDomain: "impostor-game-e2bec.firebaseapp.com",
  projectId: "impostor-game-e2bec",
  storageBucket: "impostor-game-e2bec.firebasestorage.app",
  messagingSenderId: "91990939868",
  appId: "1:91990939868:web:8d7ef85ada985594063c19",
  measurementId: "G-NQ7F2HX43B"
};
// -----------------------------------------------------------------------

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ----- Helper utilities -----
const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);

// ----- State -----
let myId = uid();
let myName = "";
let currentRoom = null;
let isHost = false;
let unsubPlayers = null;
let unsubRoom = null;
let categories = [
  "Animals","Food","Sports","Movies","Professions","Countries","Fruits","School Subjects","Things in a Kitchen","Video Games"
];

// ----- Elements -----
const lobbySection = $('lobbySection');
const roomSection = $('roomSection');

const createRoomId = $('createRoomId');
const createPassword = $('createPassword');
const displayNameCreate = $('displayNameCreate');
const createRoomBtn = $('createRoomBtn');

const joinRoomId = $('joinRoomId');
const joinPassword = $('joinPassword');
const displayNameJoin = $('displayNameJoin');
const joinRoomBtn = $('joinRoomBtn');

const leaveRoomBtn = $('leaveRoomBtn');
const roomIdLabel = $('roomIdLabel');
const roomStatusLabel = $('roomStatusLabel');
const playersList = $('playersList');
const hostControls = $('hostControls');
const categorySelect = $('categorySelect');
const randomCategoryBtn = $('randomCategoryBtn');
const hintInput = $('hintInput');
const startRoundBtn = $('startRoundBtn');
const endVoteBtn = $('endVoteBtn');
const rematchBtn = $('rematchBtn');

const roleLabel = $('roleLabel');
const categoryLabel = $('categoryLabel');
const hintBox = $('hintBox');
const hintLabel = $('hintLabel');

const submitArea = $('submitArea');
const wordInput = $('wordInput');
const submitWordBtn = $('submitWordBtn');
const submittedMsg = $('submittedMsg');

const votingArea = $('votingArea');
const votingList = $('votingList');
const voteStatus = $('voteStatus');

const resultsArea = $('resultsArea');
const resultsText = $('resultsText');

// ---------- init UI ----------
function initCategoryOptions(){
  categorySelect.innerHTML = '';
  categories.forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    categorySelect.appendChild(o);
  });
}
initCategoryOptions();

// ---------- Room lifecycle ----------
createRoomBtn.onclick = async () => {
  const id = (createRoomId.value || '').trim();
  const pass = (createPassword.value || '').trim();
  const name = (displayNameCreate.value || '').trim();
  if (!id || !name) return alert('Enter room id and your name');
  myName = name;
  isHost = true;
  await createRoom(id, pass);
};

joinRoomBtn.onclick = async () => {
  const id = (joinRoomId.value || '').trim();
  const pass = (joinPassword.value || '').trim();
  const name = (displayNameJoin.value || '').trim();
  if (!id || !name) return alert('Enter room id and your name');
  myName = name;
  isHost = false;
  await joinRoom(id, pass);
};

leaveRoomBtn.onclick = async () => {
  if (!currentRoom) return;
  await leaveRoom();
};

// create room
async function createRoom(id, password){
  const roomRef = db.collection('rooms').doc(id);
  const exists = (await roomRef.get()).exists;
  if (exists) return alert('Room ID already exists — pick another or join it.');
  await roomRef.set({
    hostId: myId,
    status: 'lobby',
    password: password || '',
    category: '',
    hint: '',
    impostorId: '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await addPlayerToRoom(roomRef);
  listenToRoom(roomRef);
  showRoomUI(id);
}

// join room
async function joinRoom(id, password){
  const roomRef = db.collection('rooms').doc(id);
  const snap = await roomRef.get();
  if (!snap.exists) return alert('Room not found');
  const data = snap.data();
  if ((data.password || '') !== (password || '')) return alert('Wrong password');
  await addPlayerToRoom(roomRef);
  listenToRoom(roomRef);
  showRoomUI(id);
}

// add player
async function addPlayerToRoom(roomRef){
  currentRoom = roomRef.id;
  const playerRef = roomRef.collection('players').doc(myId);
  await playerRef.set({
    id: myId,
    name: myName,
    word: '',
    votedFor: '',
    alive: true,
    submitted: false
  });
}

// leave room cleanup
async function leaveRoom(){
  try {
    const roomRef = db.collection('rooms').doc(currentRoom);
    await roomRef.collection('players').doc(myId).delete();
    // if I was host and room still exists, try to transfer host to another player
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      currentRoom = null;
    } else {
      const roomData = roomSnap.data();
      if (roomData.hostId === myId) {
        const players = await roomRef.collection('players').get();
        if (!players.empty) {
          const first = players.docs[0].data();
          await roomRef.update({ hostId: first.id });
        } else {
          // no players left — delete room
          await roomRef.delete();
        }
      }
    }
  } catch (e) { console.error(e) }
  cleanupListeners();
  resetUIToLobby();
}

// listen to room real-time
function listenToRoom(roomRef){
  cleanupListeners();
  unsubPlayers = roomRef.collection('players').onSnapshot(renderPlayers);
  unsubRoom = roomRef.onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    renderRoomState(data);
  });
}

// cleanup listeners
function cleanupListeners(){
  if (unsubPlayers) unsubPlayers();
  if (unsubRoom) unsubRoom();
  unsubPlayers = null; unsubRoom = null;
}

// show/hide UI
function showRoomUI(id){
  lobbySection.style.display = 'none';
  roomSection.style.display = 'block';
  roomIdLabel.textContent = id;
  roomStatusLabel.textContent = '';
  hostControls.style.display = 'none';
  submitArea.style.display = 'none';
  votingArea.style.display = 'none';
  resultsArea.style.display = 'none';
  roleLabel.textContent = '—';
  categoryLabel.textContent = '—';
  hintBox.style.display = 'none';
}

// back to lobby
function resetUIToLobby(){
  lobbySection.style.display = 'block';
  roomSection.style.display = 'none';
  currentRoom = null;
  isHost = false;
  myName = '';
}

// render players
function renderPlayers(snapshot){
  playersList.innerHTML = '';
  votingList.innerHTML = '';
  snapshot.forEach(doc => {
    const p = doc.data();
    const li = document.createElement('li');
    li.textContent = `${p.name} ${p.alive ? '' : '(out)'}`;
    const status = document.createElement('span');
    status.className = 'small-muted';
    status.textContent = p.submitted ? 'submitted' : '';
    li.appendChild(status);
    playersList.appendChild(li);

    // voting list (only alive)
    if (p.alive) {
      const vli = document.createElement('li');
      vli.textContent = p.name;
      const btn = document.createElement('button');
      btn.textContent = 'Vote';
      btn.onclick = () => submitVote(p.id);
      vli.appendChild(btn);
      votingList.appendChild(vli);
    }
  });
}

// render room state (host, game phase, etc)
function renderRoomState(data){
  roomStatusLabel.textContent = `· ${data.status || 'lobby'}`;
  categoryLabel.textContent = data.category || '—';
  hintLabel.textContent = data.hint || '';
  if (data.hint) hintBox.style.display = 'block'; else hintBox.style.display = 'none';

  // host control visibility
  if (data.hostId === myId){
    hostControls.style.display = 'block';
    isHost = true;
  } else {
    hostControls.style.display = 'none';
    isHost = false;
  }

  // set role label (if playing)
  if (data.status === 'playing') {
    // set role on the client by comparing myId to impostorId
    if (data.impostorId === myId) {
      roleLabel.textContent = 'IMPOSTOR';
    } else {
      roleLabel.textContent = 'Player';
    }
    submitArea.style.display = 'block';
    votingArea.style.display = 'none';
    resultsArea.style.display = 'none';
    endVoteBtn.style.display = 'none';
    startRoundBtn.style.display = isHost ? 'none' : 'none';
    rematchBtn.style.display = 'none';
  } else if (data.status === 'voting') {
    roleLabel.textContent = 'Voting';
    submitArea.style.display = 'none';
    votingArea.style.display = 'block';
    // host can end vote
    endVoteBtn.style.display = isHost ? 'inline-block' : 'none';
    rematchBtn.style.display = 'none';
  } else if (data.status === 'results') {
    submitArea.style.display = 'none';
    votingArea.style.display = 'none';
    resultsArea.style.display = 'block';
    rematchBtn.style.display = isHost ? 'inline-block' : 'none';
    endVoteBtn.style.display = 'none';
    // show results text (compute from room doc fields if available)
    let text = '';
    if (data.revealedOut && data.revealedOut.length) {
      text += `Voted out: ${data.revealedOut.join(', ')}. `;
    }
    if (data.impostorId) {
      text += `Impostor was: ${data.impostorName || 'Unknown'}.`;
    }
    resultsText.textContent = text;
  } else { // lobby
    roleLabel.textContent = 'In lobby';
    submitArea.style.display = 'none';
    votingArea.style.display = 'none';
    resultsArea.style.display = 'none';
    startRoundBtn.style.display = isHost ? 'inline-block' : 'none';
    endVoteBtn.style.display = 'none';
    rematchBtn.style.display = 'none';
  }
}

// ---------- Game actions ----------

// host: random category
randomCategoryBtn.onclick = () => {
  const c = categories[Math.floor(Math.random()*categories.length)];
  categorySelect.value = c;
};

// host: start round
startRoundBtn.onclick = async () => {
  if (!currentRoom) return;
  const roomRef = db.collection('rooms').doc(currentRoom);
  const cat = categorySelect.value || categories[Math.floor(Math.random()*categories.length)];
  const hint = (hintInput.value || '').trim();
  // pick impostor randomly among alive players
  const playersSnap = await roomRef.collection('players').where('alive','==',true).get();
  if (playersSnap.size < 3) return alert('Need at least 3 players to start.');
  const players = playersSnap.docs.map(d => d.data());
  const impostor = players[Math.floor(Math.random()*players.length)];
  // set room state
  await roomRef.update({
    status: 'playing',
    category: cat,
    hint: hint,
    impostorId: impostor.id,
    impostorName: impostor.name,
    revealedOut: []
  });
  // reset players' fields
  const batch = db.batch();
  playersSnap.docs.forEach(d => {
    const pRef = roomRef.collection('players').doc(d.id);
    batch.update(pRef, { word: '', votedFor: '', submitted: false });
  });
  await batch.commit();
};

// submit word (anytime during playing)
submitWordBtn.onclick = async () => {
  const w = (wordInput.value || '').trim();
  if (!w) return alert('Enter a word');
  const roomRef = db.collection('rooms').doc(currentRoom);
  await roomRef.collection('players').doc(myId).update({ word: w, submitted: true });
  submittedMsg.style.display = 'block';
  // check if all alive players have submitted; if so, move to voting automatically
  const playersSnap = await roomRef.collection('players').where('alive','==',true).get();
  const allSubmitted = playersSnap.docs.every(d => d.data().submitted);
  if (allSubmitted) {
    await roomRef.update({ status: 'voting' });
  }
};

// submit vote
async function submitVote(targetId){
  if (!currentRoom) return;
  const roomRef = db.collection('rooms').doc(currentRoom);
  await roomRef.collection('players').doc(myId).update({ votedFor: targetId });
  voteStatus.textContent = 'Vote submitted.';
  // optional: auto-tally when all votes in
  const playersSnap = await roomRef.collection('players').where('alive','==',true).get();
  const allVoted = playersSnap.docs.every(d => d.data().votedFor);
  if (allVoted) {
    if (isHost) {
      // host auto-tally
      await tallyVotes();
    }
  }
}

// host: end vote / tally
endVoteBtn.onclick = async () => {
  if (!currentRoom || !isHost) return;
  await tallyVotes();
}

// tallyVotes (host-only)
async function tallyVotes(){
  const roomRef = db.collection('rooms').doc(currentRoom);
  const playersSnap = await roomRef.collection('players').where('alive','==',true).get();
  // count votes
  const counts = {};
  playersSnap.forEach(d => {
    const v = d.data().votedFor;
    if (!v) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  // find max voted
  let max = -1;
  let maxId = null;
  for (const id in counts) {
    if (counts[id] > max) { max = counts[id]; maxId = id; }
  }
  // if tie or nobody voted: randomly pick among alive
  let outIds = [];
  if (!maxId) {
    // nobody voted -> no elimination
    outIds = [];
  } else {
    // find if tie
    const maxCount = counts[maxId];
    const tied = Object.keys(counts).filter(k => counts[k] === maxCount);
    if (tied.length > 1) {
      // tie -> no elimination
      outIds = [];
    } else {
      outIds = [maxId];
    }
  }

  // apply elimination (set alive false) and prepare result info
  const batch = db.batch();
  const revealedNames = [];
  for (const outId of outIds) {
    const pRef = roomRef.collection('players').doc(outId);
    batch.update(pRef, { alive: false });
    const pDoc = await pRef.get();
    revealedNames.push(pDoc.exists ? pDoc.data().name : outId);
  }
  await batch.commit();

  // prepare final reveal: check impostor
  const roomDoc = await roomRef.get();
  const roomData = roomDoc.data();
  const impostorId = roomData.impostorId;
  const impostorName = roomData.impostorName || null;
  // update room to results
  await roomRef.update({
    status: 'results',
    revealedOut: revealedNames,
    impostorId: impostorId,
    impostorName: impostorName
  });
}

// rematch (host starts next round without leaving room)
rematchBtn.onclick = async () => {
  if (!currentRoom || !isHost) return;
  const roomRef = db.collection('rooms').doc(currentRoom);
  // bring all players back alive and reset words/votes
  const playersSnap = await roomRef.collection('players').get();
  const batch = db.batch();
  playersSnap.docs.forEach(d => {
    const pRef = roomRef.collection('players').doc(d.id);
    batch.update(pRef, { alive: true, word: '', votedFor: '', submitted: false });
  });
  await batch.commit();
  // choose new impostor and start playing (use the category select/hint or random)
  const playersAliveSnap = await roomRef.collection('players').where('alive','==',true).get();
  if (playersAliveSnap.size < 3) return alert('Need at least 3 players to start.');
  const players = playersAliveSnap.docs.map(d => d.data());
  const impostor = players[Math.floor(Math.random()*players.length)];
  const cat = categorySelect.value || categories[Math.floor(Math.random()*categories.length)];
  const hint = (hintInput.value || '').trim();
  await roomRef.update({
    status: 'playing',
    category: cat,
    hint: hint,
    impostorId: impostor.id,
    impostorName: impostor.name,
    revealedOut: []
  });
}

// ---------- Startup bindings ----------
window.addEventListener('beforeunload', () => {
  // optional: try to remove player if they close
  if (currentRoom) {
    db.collection('rooms').doc(currentRoom).collection('players').doc(myId).delete().catch(()=>{});
  }
});
