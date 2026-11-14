// Conecta Escola — aplicação de demonstração com Firebase
// 1) Substitui firebaseConfig pelos dados do teu projeto Firebase.
// 2) Publica firestore.rules no Firebase Console antes de testar mensagens.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc,
  query, where, orderBy, onSnapshot, getDocs, serverTimestamp, arrayUnion,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Firebase Console > Project settings > Your apps > SDK setup and configuration
const firebaseConfig = {
  apiKey: "COLOCA_AQUI_A_TUA_API_KEY",
  authDomain: "COLOCA_AQUI.firebaseapp.com",
  projectId: "COLOCA_AQUI",
  storageBucket: "COLOCA_AQUI.appspot.com",
  messagingSenderId: "COLOCA_AQUI",
  appId: "COLOCA_AQUI"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let activeView = "people";
let activeChatId = null;
let activeClassId = null;
let stopChats = null;
let stopMessages = null;
let stopClassMessages = null;
let stopPeople = null;
let stopClasses = null;
let cachedPeople = [];
let cachedChats = [];
let cachedClasses = [];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function initials(name = "A") {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "A";
}
function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => $("toast").classList.add("hidden"), 3500);
}
function setNotice(message = "", isError = false) {
  const notice = $("notice");
  notice.textContent = message;
  notice.classList.toggle("hidden", !message);
  notice.classList.toggle("error", isError);
}
function errorText(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail já tem uma conta.",
    "auth/invalid-email": "O formato do e-mail não é válido.",
    "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não existe conta com este e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "permission-denied": "A operação foi bloqueada pelas regras de segurança. Confirma se publicaste firestore.rules.",
    "unavailable": "Sem ligação ao serviço. Verifica a internet e tenta novamente."
  };
  return messages[error?.code] || error?.message || "Ocorreu um erro. Tenta novamente.";
}
function showAuth(mode = "login") {
  $("auth-view").classList.remove("hidden");
  $("app-view").classList.add("hidden");
  $("header-user").classList.add("hidden");
  $("login-form").classList.toggle("hidden", mode !== "login");
  $("register-form").classList.toggle("hidden", mode !== "register");
  $("show-login").classList.toggle("active", mode === "login");
  $("show-register").classList.toggle("active", mode === "register");
}
function showApp() {
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("header-user").classList.remove("hidden");
}
function cleanListeners() {
  [stopChats, stopMessages, stopClassMessages, stopPeople, stopClasses].forEach(fn => {
    if (typeof fn === "function") fn();
  });
  stopChats = stopMessages = stopClassMessages = stopPeople = stopClasses = null;
}
function switchView(view) {
  activeView = view;
  document.querySelectorAll(".content-view").forEach(el => el.classList.add("hidden"));
  $(`view-${view}`).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  setNotice("");
  if (view === "people") loadPeople();
  if (["feed", "news", "lessons", "staff"].includes(view)) loadSchoolSection(view);
  if (view === "chats") loadChats();
  if (view === "classes") loadClasses();
  if (view === "profile") fillProfileForm();
}
async function ensureProfile(user, nameFromForm = "", classFromForm = "") {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const profile = {
      uid: user.uid,
      name: nameFromForm || user.displayName || (user.email || "Aluno").split("@")[0],
      email: user.email || "",
      className: classFromForm || "",
      bio: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    return profile;
  }
  return snap.data();
}

$("show-login").addEventListener("click", () => showAuth("login"));
$("show-register").addEventListener("click", () => showAuth("register"));

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("register-error").textContent = "";
  const name = $("register-name").value.trim();
  const email = $("register-email").value.trim();
  const password = $("register-password").value;
  const className = $("register-class").value.trim();
  const role = $("register-role").value;
  const schoolName = $("register-school-name").value.trim();
  const schoolCodeInput = $("register-school-code").value.trim().toUpperCase();
  if (role === "school" && schoolName.length < 3) { $("register-error").textContent = "Indica o nome da escola."; return; }
  let schoolId = "";
  if (role === "student") {
    if (!schoolCodeInput) { $("register-error").textContent = "Pede o código de acesso à tua escola."; return; }
    try {
      const schoolSnap = await getDoc(doc(db, "schools", schoolCodeInput));
      if (!schoolSnap.exists()) { $("register-error").textContent = "Código de escola não encontrado."; return; }
      schoolId = schoolCodeInput;
    } catch (e) { $("register-error").textContent = errorText(e); return; }
  }
  if (name.length < 2) { $("register-error").textContent = "Escreve o teu nome completo."; return; }
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid, name, email, className, bio: "", role, schoolId: role === "school" ? "" : schoolId, schoolName: role === "school" ? schoolName : "",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    if (role === "school") {
      const code = Math.random().toString(36).slice(2, 9).toUpperCase();
      await setDoc(doc(db, "schools", code), { code, name: schoolName, ownerId: credential.user.uid, createdAt: serverTimestamp() });
      await updateDoc(doc(db, "users", credential.user.uid), { schoolId: code });
      if (currentUser && currentUser.uid === credential.user.uid) { currentProfile = { ...(currentProfile || {}), role: "school", schoolId: code, schoolName }; renderCurrentProfile(); applyRoleVisibility(); }
      showToast("Conta criada! Código da escola: " + code);
    } else showToast("Conta criada com sucesso!");
  } catch (error) {
    $("register-error").textContent = errorText(error);
  }
});


$("register-role").addEventListener("change", () => {
  const isSchool = $("register-role").value === "school";
  $("student-fields").classList.toggle("hidden", isSchool);
  $("school-fields").classList.toggle("hidden", !isSchool);
});

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-error").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-password").value);
  } catch (error) {
    $("login-error").textContent = errorText(error);
  }
});
$("logout-btn").addEventListener("click", async () => {
  cleanListeners();
  await signOut(auth);
});
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));

onAuthStateChanged(auth, async (user) => {
  cleanListeners();
  currentUser = user;
  activeChatId = null;
  activeClassId = null;
  if (!user) {
    currentProfile = null;
    showAuth("login");
    return;
  }
  try {
    currentProfile = await ensureProfile(user);
    await updateDoc(doc(db, "users", user.uid), { online: true, lastSeen: serverTimestamp() }).catch(() => {});
    showApp();
    applyRoleVisibility();
    renderCurrentProfile();
    $("header-name").textContent = currentProfile.name || user.email;
    switchView("people");
  } catch (error) {
    showApp();
    setNotice("Não foi possível carregar o perfil: " + errorText(error), true);
  }
});

function renderCurrentProfile() {
  const name = currentProfile?.name || currentUser?.displayName || "Aluno";
  $("sidebar-name").textContent = name;
  $("sidebar-class").textContent = currentProfile?.className || "Sem turma definida";
  $("sidebar-avatar").textContent = initials(name);
  if (currentProfile?.photoData) { $("sidebar-avatar").style.backgroundImage = `url("${currentProfile.photoData}")`; $("sidebar-avatar").classList.add("photo-avatar"); }
  else { $("sidebar-avatar").style.backgroundImage = ""; $("sidebar-avatar").classList.remove("photo-avatar"); }
  $("header-name").textContent = name;
}
function fillProfileForm() {
  if (!currentProfile || !currentUser) return;
  $("profile-name").value = currentProfile.name || "";
  $("profile-class").value = currentProfile.className || "";
  $("profile-bio").value = currentProfile.bio || "";
  $("profile-preview-name").textContent = currentProfile.name || "Aluno";
  $("profile-preview-email").textContent = currentUser.email || "";
  $("profile-avatar").textContent = initials(currentProfile.name);
  if (currentProfile.photoData) { $("profile-avatar").style.backgroundImage = `url("${currentProfile.photoData}")`; $("profile-avatar").classList.add("photo-avatar"); }
}
$("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("profile-error").textContent = "";
  const name = $("profile-name").value.trim();
  const className = $("profile-class").value.trim();
  const bio = $("profile-bio").value.trim();
  let photoData = currentProfile.photoData || "";
  const photoFile = $("profile-photo").files[0];
  if (photoFile) {
    if (!photoFile.type.startsWith("image/")) { $("profile-error").textContent = "Escolhe um ficheiro de imagem."; return; }
    try { photoData = await compressImage(photoFile); } catch (e) { $("profile-error").textContent = "Não foi possível processar a fotografia."; return; }
  }
  if (name.length < 2) { $("profile-error").textContent = "O nome deve ter pelo menos 2 caracteres."; return; }
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { name, className, bio, photoData, updatedAt: serverTimestamp() });
    await updateProfile(currentUser, { displayName: name });
    currentProfile = { ...currentProfile, name, className, bio, photoData };
    renderCurrentProfile();
    fillProfileForm();
    showToast("Perfil atualizado.");
  } catch (error) { $("profile-error").textContent = errorText(error); }
});

function loadPeople() {
  if (stopPeople) stopPeople();
  const q = query(collection(db, "users"), where("schoolId", "==", currentProfile.schoolId || ""), orderBy("name"), limit(100));
  stopPeople = onSnapshot(q, snapshot => {
    cachedPeople = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(person => person.uid !== currentUser.uid && person.role !== "school");
    renderPeople();
  }, error => setNotice("Erro ao carregar alunos: " + errorText(error), true));
}
function renderPeople() {
  const term = $("people-search").value.trim().toLowerCase();
  const people = cachedPeople.filter(person =>
    (person.name || "").toLowerCase().includes(term) || (person.className || "").toLowerCase().includes(term)
  );
  $("people-list").innerHTML = people.length ? people.map(person => `
    <article class="person-card">
      <div class="avatar avatar-large">${escapeHTML(initials(person.name))}</div>
      <div class="person-info"><strong>${escapeHTML(person.name || "Aluno")}</strong><span>${escapeHTML(person.className || "Turma não indicada")} · <i class="online-dot ${person.online ? "is-online" : ""}"></i> ${person.online ? "Online" : "Offline"}</span></div>
      <button class="button button-light" data-message-user="${escapeHTML(person.uid)}" type="button">Mensagem</button>
    </article>`).join("") : `<div class="empty-state">Não foram encontrados alunos. Tenta outra pesquisa.</div>`;
  $("people-list").querySelectorAll("[data-message-user]").forEach(button => button.addEventListener("click", () => openDirectChat(button.dataset.messageUser)));
}
$("people-search").addEventListener("input", renderPeople);

function chatIdFor(uid1, uid2) { return [uid1, uid2].sort().join("__"); }
async function openDirectChat(otherUid) {
  if (!otherUid || otherUid === currentUser.uid) return;
  try {
    const other = cachedPeople.find(person => person.uid === otherUid) || (await getDoc(doc(db, "users", otherUid))).data();
    if (!other) { showToast("Este perfil já não está disponível."); return; }
    if ((other.schoolId || "") !== (currentProfile.schoolId || "")) { showToast("Só podes conversar com pessoas da tua escola."); return; }
    const chatId = chatIdFor(currentUser.uid, otherUid);
    const chatRef = doc(db, "chats", chatId);
    const snap = await getDoc(chatRef);
    if (!snap.exists()) {
      await setDoc(chatRef, {
        type: "direct",
        members: [currentUser.uid, otherUid].sort(),
        memberNames: { [currentUser.uid]: currentProfile.name, [otherUid]: other.name || "Aluno" },
        schoolId: currentProfile.schoolId || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: ""
      });
    }
    switchView("chats");
    await loadChats();
    openChat(chatId, other.name || "Aluno", otherUid);
  } catch (error) { showToast(errorText(error)); }
}
function loadChats() {
  if (stopChats) stopChats();
  const q = query(collection(db, "chats"), where("members", "array-contains", currentUser.uid));
  stopChats = onSnapshot(q, snapshot => {
    cachedChats = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() || 0, tb = b.updatedAt?.toMillis?.() || 0;
      return tb - ta;
    });
    $("chat-count").textContent = String(cachedChats.length);
    renderChatList();
  }, error => setNotice("Erro ao carregar conversas: " + errorText(error), true));
}
function renderChatList() {
  const list = $("chat-list");
  if (!cachedChats.length) {
    list.innerHTML = `<div class="empty-state">Ainda não tens conversas. Vai a “Alunos” e carrega em Mensagem.</div>`;
    return;
  }
  list.innerHTML = cachedChats.map(chat => {
    const otherUid = chat.members.find(uid => uid !== currentUser.uid);
    const name = chat.memberNames?.[otherUid] || "Colega";
    return `<button class="chat-list-item ${chat.id === activeChatId ? "active" : ""}" data-chat-id="${escapeHTML(chat.id)}" data-other-uid="${escapeHTML(otherUid || "")}" type="button">
      <div class="avatar">${escapeHTML(initials(name))}</div><div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(chat.lastMessage || "Iniciar conversa")}</small></div>
    </button>`;
  }).join("");
  list.querySelectorAll("[data-chat-id]").forEach(button => button.addEventListener("click", () => {
    const chat = cachedChats.find(item => item.id === button.dataset.chatId);
    const otherUid = button.dataset.otherUid;
    const name = chat?.memberNames?.[otherUid] || cachedPeople.find(p => p.uid === otherUid)?.name || "Colega";
    openChat(button.dataset.chatId, name, otherUid);
  }));
}
function openChat(chatId, name, otherUid) {
  activeChatId = chatId;
  if (stopMessages) stopMessages();
  renderChatList();
  const room = $("chat-room");
  room.innerHTML = `
    <div class="room-header"><div class="avatar">${escapeHTML(initials(name))}</div><div><strong>${escapeHTML(name)}</strong><small>Conversa privada</small></div></div>
    <div id="private-messages" class="message-list"><div class="empty-state">A carregar mensagens...</div></div>
    <form id="private-message-form" class="message-form"><input id="private-message-input" type="text" maxlength="2000" placeholder="Escreve uma mensagem..." autocomplete="off" required><button class="button button-primary" type="submit">Enviar</button></form>`;
  const messagesRef = collection(db, "chats", chatId, "messages");
  stopMessages = onSnapshot(query(messagesRef, orderBy("createdAt"), limit(200)), snapshot => {
    const container = $("private-messages");
    if (!container) return;
    container.innerHTML = snapshot.empty ? `<div class="empty-state">Esta conversa está vazia. Envia a primeira mensagem.</div>` : snapshot.docs.map(d => renderMessage(d.data())).join("");
    container.scrollTop = container.scrollHeight;
  }, error => showToast("Não foi possível carregar mensagens: " + errorText(error)));
  $("private-message-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("private-message-input");
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      await addDoc(messagesRef, { text, senderId: currentUser.uid, senderName: currentProfile.name, createdAt: serverTimestamp() });
      await updateDoc(doc(db, "chats", chatId), { lastMessage: text.slice(0, 80), updatedAt: serverTimestamp() });
      input.value = "";
    } catch (error) { showToast(errorText(error)); }
    finally { input.disabled = false; input.focus(); }
  });
}
function renderMessage(message) {
  const mine = message.senderId === currentUser.uid;
  const time = message.createdAt?.toDate ? message.createdAt.toDate().toLocaleString("pt-PT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "agora";
  return `<div class="message ${mine ? "mine" : ""}">${escapeHTML(message.text || "")}<small>${mine ? "Tu" : escapeHTML(message.senderName || "Colega")} · ${escapeHTML(time)}</small></div>`;
}

$("create-class-form").addEventListener("submit", async event => {
  event.preventDefault();
  const name = $("new-class-name").value.trim();
  const description = $("new-class-description").value.trim();
  if (!name) return;
  try {
    await addDoc(collection(db, "classes"), {
      name, description, creatorId: currentUser.uid, schoolId: currentProfile.schoolId || "",
      members: [currentUser.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: ""
    });
    $("new-class-name").value = "";
    $("new-class-description").value = "";
    showToast("Turma criada. Outros alunos já podem entrar.");
  } catch (error) { showToast(errorText(error)); }
});
function loadClasses() {
  if (stopClasses) stopClasses();
  const q = query(collection(db, "classes"), where("schoolId", "==", currentProfile.schoolId || ""), orderBy("name"), limit(100));
  stopClasses = onSnapshot(q, snapshot => {
    cachedClasses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderClasses();
  }, error => setNotice("Erro ao carregar turmas: " + errorText(error), true));
}
function renderClasses() {
  const container = $("classes-list");
  if (!cachedClasses.length) {
    container.innerHTML = `<div class="empty-state">Ainda não há turmas. Cria a primeira turma.</div>`;
    return;
  }
  container.innerHTML = cachedClasses.map(item => {
    const joined = (item.members || []).includes(currentUser.uid);
    return `<article class="class-card">
      <div class="avatar">${escapeHTML(initials(item.name))}</div>
      <div class="class-info"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.description || "Grupo de comunicação da turma")}</span><span>${(item.members || []).length} participante(s)</span></div>
      <button class="button ${joined ? "button-light" : "button-primary"}" data-class-action="${joined ? "open" : "join"}" data-class-id="${escapeHTML(item.id)}" type="button">${joined ? "Abrir grupo" : "Entrar na turma"}</button>
    </article>`;
  }).join("");
  container.querySelectorAll("[data-class-id]").forEach(button => button.addEventListener("click", async () => {
    const classId = button.dataset.classId;
    const item = cachedClasses.find(c => c.id === classId);
    if (!item) return;
    if (button.dataset.classAction === "join") {
      try {
        await updateDoc(doc(db, "classes", classId), { members: arrayUnion(currentUser.uid), updatedAt: serverTimestamp() });
        showToast("Entraste na turma!");
      } catch (error) { showToast(errorText(error)); }
    } else openClassRoom(item);
  }));
}
function openClassRoom(item) {
  activeClassId = item.id;
  if (stopClassMessages) stopClassMessages();
  const room = $("class-room");
  room.classList.remove("hidden");
  room.innerHTML = `
    <div class="room-header"><div class="avatar">${escapeHTML(initials(item.name))}</div><div><strong>${escapeHTML(item.name)}</strong><small>Grupo da turma · ${(item.members || []).length} participante(s)</small></div></div>
    <div id="class-messages" class="message-list"><div class="empty-state">A carregar mensagens...</div></div>
    <form id="class-message-form" class="message-form"><input id="class-message-input" type="text" maxlength="2000" placeholder="Escreve para a turma..." autocomplete="off" required><button class="button button-primary" type="submit">Enviar</button></form>`;
  room.scrollIntoView({ behavior: "smooth", block: "nearest" });
  const messagesRef = collection(db, "classes", item.id, "messages");
  stopClassMessages = onSnapshot(query(messagesRef, orderBy("createdAt"), limit(200)), snapshot => {
    const container = $("class-messages");
    if (!container) return;
    container.innerHTML = snapshot.empty ? `<div class="empty-state">Ainda não há mensagens nesta turma.</div>` : snapshot.docs.map(d => renderMessage(d.data())).join("");
    container.scrollTop = container.scrollHeight;
  }, error => showToast("Não foi possível carregar o grupo: " + errorText(error)));
  $("class-message-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("class-message-input");
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      await addDoc(messagesRef, { text, senderId: currentUser.uid, senderName: currentProfile.name, createdAt: serverTimestamp() });
      await updateDoc(doc(db, "classes", item.id), { lastMessage: text.slice(0, 80), updatedAt: serverTimestamp() });
      input.value = "";
    } catch (error) { showToast(errorText(error)); }
    finally { input.disabled = false; input.focus(); }
  });
}


// ===== Funcionalidades novas: publicações, notícias, aulas, funcionários e presença =====
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image(); img.onerror = reject;
      img.onload = () => {
        const max = 420, scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function schoolRequired() {
  if (!currentProfile?.schoolId) { showToast("Esta conta ainda não está associada a uma escola."); return false; }
  return true;
}
function applyRoleVisibility() {
  const isSchool = currentProfile?.role === "school";
  document.querySelectorAll(".school-only").forEach(el => el.classList.toggle("hidden", !isSchool));
  document.querySelectorAll(".staff-only").forEach(el => el.classList.toggle("hidden", !isSchool));
}
function loadSchoolSection(view) {
  if (!schoolRequired()) return;
  applyRoleVisibility();
  const col = { feed: "posts", news: "news", lessons: "lessons", staff: "staff" }[view];
  const target = $(view === "feed" ? "posts-list" : view === "news" ? "news-list" : view === "lessons" ? "lessons-list" : "staff-list");
  if (!target) return;
  const q = query(collection(db, col), where("schoolId", "==", currentProfile.schoolId), orderBy("createdAt", "desc"), limit(50));
  onSnapshot(q, snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!rows.length) { target.innerHTML = `<div class="empty-state">Ainda não existem registos nesta secção.</div>`; return; }
    if (view === "staff") {
      target.innerHTML = rows.map(x => `<article class="person-card"><div class="avatar avatar-large">${escapeHTML(initials(x.name))}</div><div class="person-info"><strong>${escapeHTML(x.name)}</strong><span>${escapeHTML(x.role || "Funcionário")}${x.subject ? " · " + escapeHTML(x.subject) : ""}</span></div></article>`).join("");
    } else if (view === "lessons") {
      target.innerHTML = rows.map(x => `<article class="feed-card"><h3>${escapeHTML(x.title)}</h3><p class="muted">${escapeHTML(x.subject)} · Professor(a): ${escapeHTML(x.teacher)}</p><p>${escapeHTML(x.body)}</p></article>`).join("");
    } else if (view === "news") {
      target.innerHTML = rows.map(x => `<article class="feed-card"><h3>${escapeHTML(x.title)}</h3><p>${escapeHTML(x.body)}</p><small>${escapeHTML(x.authorName || "Escola")}</small></article>`).join("");
    } else {
      target.innerHTML = rows.map(x => `<article class="feed-card"><div class="feed-author"><strong>${escapeHTML(x.authorName || "Aluno")}</strong><small>${escapeHTML(x.createdAt?.toDate ? x.createdAt.toDate().toLocaleString("pt-PT") : "Agora")}</small></div><p>${escapeHTML(x.text)}</p><form class="comment-form" data-post-id="${escapeHTML(x.id)}"><input name="comment" maxlength="500" placeholder="Escreve um comentário..." required><button class="button button-light" type="submit">Comentar</button></form><div class="comments" id="comments-${escapeHTML(x.id)}">A carregar comentários...</div></article>`).join("");
      rows.forEach(x => {
        const commentsEl = $("comments-" + x.id);
        onSnapshot(query(collection(db, "posts", x.id, "comments"), orderBy("createdAt"), limit(30)), cs => {
          commentsEl.innerHTML = cs.empty ? "" : cs.docs.map(d => `<p class="comment"><b>${escapeHTML(d.data().authorName || "Aluno")}:</b> ${escapeHTML(d.data().text || "")}</p>`).join("");
        });
      });
      target.querySelectorAll(".comment-form").forEach(form => form.addEventListener("submit", async ev => {
        ev.preventDefault(); const input = form.elements.comment; const text = input.value.trim(); if (!text) return;
        try { await addDoc(collection(db, "posts", form.dataset.postId, "comments"), { text, authorId: currentUser.uid, authorName: currentProfile.name, schoolId: currentProfile.schoolId, createdAt: serverTimestamp() }); input.value = ""; }
        catch (e) { showToast(errorText(e)); }
      }));
    }
  }, err => setNotice("Não foi possível carregar esta secção: " + errorText(err), true));
}
$("post-form").addEventListener("submit", async e => {
  e.preventDefault(); if (!schoolRequired()) return;
  const text = $("post-text").value.trim(); if (!text) return;
  try { await addDoc(collection(db, "posts"), { text, authorId: currentUser.uid, authorName: currentProfile.name, schoolId: currentProfile.schoolId, createdAt: serverTimestamp() }); $("post-text").value = ""; showToast("Publicação partilhada com a tua escola."); }
  catch (err) { showToast(errorText(err)); }
});
$("news-form").addEventListener("submit", async e => {
  e.preventDefault(); if (!schoolRequired() || currentProfile.role !== "school") return;
  try { await addDoc(collection(db, "news"), { title: $("news-title").value.trim(), body: $("news-body").value.trim(), authorId: currentUser.uid, authorName: currentProfile.name, schoolId: currentProfile.schoolId, createdAt: serverTimestamp() }); e.target.reset(); showToast("Notícia publicada."); }
  catch (err) { showToast(errorText(err)); }
});
$("lesson-form").addEventListener("submit", async e => {
  e.preventDefault(); if (!schoolRequired() || currentProfile.role !== "school") return;
  try { await addDoc(collection(db, "lessons"), { title: $("lesson-title").value.trim(), subject: $("lesson-subject").value.trim(), teacher: $("lesson-teacher").value.trim(), body: $("lesson-body").value.trim(), schoolId: currentProfile.schoolId, authorId: currentUser.uid, createdAt: serverTimestamp() }); e.target.reset(); showToast("Aula publicada."); }
  catch (err) { showToast(errorText(err)); }
});
$("staff-form").addEventListener("submit", async e => {
  e.preventDefault(); if (!schoolRequired() || currentProfile.role !== "school") return;
  try { await addDoc(collection(db, "staff"), { name: $("staff-name").value.trim(), role: $("staff-role").value, subject: $("staff-subject").value.trim(), schoolId: currentProfile.schoolId, createdAt: serverTimestamp() }); e.target.reset(); showToast("Funcionário adicionado."); }
  catch (err) { showToast(errorText(err)); }
});
// Presença: indica atividade recente. O estado é atualizado ao entrar e ao sair.
function setOnlineState(online) {
  if (!currentUser || !currentProfile) return;
  updateDoc(doc(db, "users", currentUser.uid), { online, lastSeen: serverTimestamp() }).catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setOnlineState(true); else setOnlineState(false); });
window.addEventListener("beforeunload", () => setOnlineState(false));
