"use strict";

const API = (window.CONFIG?.apiBase || "").replace(/\/?$/, "/");
const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem("ac_token") || null,
  convId: localStorage.getItem("ac_conv") || null,
  leadId: null,
  pending: null, // message queued while verifying
};

// --- LinkedIn link from config --------------------------------------------
if (window.CONFIG?.linkedin) $("linkedin").href = window.CONFIG.linkedin;

// --- API helper ------------------------------------------------------------
async function api(path, body, headers = {}) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// --- Chat rendering --------------------------------------------------------
function addMsg(text, who) {
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  el.textContent = text;
  $("messages").appendChild(el);
  $("messages").scrollTop = $("messages").scrollHeight;
  return el;
}

async function sendChat(message) {
  addMsg(message, "user");
  const typing = addMsg("typing…", "bot typing");
  $("send").disabled = true;
  try {
    const { reply } = await api("chat", {
      token: state.token,
      convId: state.convId,
      message,
    });
    typing.remove();
    addMsg(reply, "bot");
  } catch (e) {
    typing.remove();
    if (/verify/i.test(e.message)) {
      state.token = null;
      localStorage.removeItem("ac_token");
      openModal(message);
    } else {
      addMsg(e.message, "bot");
    }
  } finally {
    $("send").disabled = false;
  }
}

// --- Composer --------------------------------------------------------------
$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const message = $("input").value.trim();
  if (!message) return;
  $("input").value = "";

  if (!state.token) {
    openModal(message); // gate: verify first, message gets sent after
    return;
  }
  sendChat(message);
});

// --- Verification modal ----------------------------------------------------
function openModal(queuedMessage) {
  state.pending = queuedMessage || state.pending;
  $("modal-err").textContent = "";
  $("modal").hidden = false;
  $("f-name").focus();
}
function closeModal() {
  $("modal").hidden = true;
}
$("modal-close").addEventListener("click", closeModal);

$("lead-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("modal-err").textContent = "";
  try {
    const { token, convId } = await api("lead", {
      name: $("f-name").value.trim(),
      email: $("f-email").value.trim(),
      phone: $("f-phone").value.trim(),
      category: $("topic").value,
    });
    state.token = token;
    state.convId = convId;
    localStorage.setItem("ac_token", token);
    localStorage.setItem("ac_conv", convId);
    closeModal();
    if (state.pending) {
      const m = state.pending;
      state.pending = null;
      sendChat(m);
    }
  } catch (err) {
    $("modal-err").textContent = err.message;
  }
});
