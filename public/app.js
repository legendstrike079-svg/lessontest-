const $ = (id) => document.getElementById(id);
let authMode = "signup";
let currentUser = null;
let toastTimer;
let selectedLesson = "Cloudy Playz lesson";

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function openAuth(mode) {
  authMode = mode;
  $("authTitle").textContent = mode === "signup" ? "Create your account" : "Welcome back";
  $("authSubtitle").textContent = mode === "signup" ? "Join the community and open your dashboard." : "Log in to continue to your dashboard.";
  $("nameField").classList.toggle("hidden", mode !== "signup");
  $("name").required = mode === "signup";
  $("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("authSubmit").textContent = mode === "signup" ? "Create account" : "Log in";
  $("switchAuthText").innerHTML = mode === "signup"
    ? 'Already have an account? <button id="switchAuth" class="text-button">Log in</button>'
    : 'New to Cloudy Playz? <button id="switchAuth" class="text-button">Create account</button>';
  $("switchAuth").addEventListener("click", () => openAuth(mode === "signup" ? "login" : "signup"));
  $("authMessage").textContent = "";
  $("authForm").reset();
  $("authModal").classList.remove("hidden");
}
function closeAuth() { $("authModal").classList.add("hidden"); }
function updateNav() {
  ["navLogin", "navSignup", "heroSignup"].forEach(id => $(id).classList.toggle("hidden", Boolean(currentUser)));
  ["navDashboard", "navLogout"].forEach(id => $(id).classList.toggle("hidden", !currentUser));
  $("accountArea").classList.toggle("hidden", !currentUser);
}
async function renderDashboard() {
  if (!currentUser) return;
  $("welcomeName").textContent = `Welcome, ${currentUser.name}!`;
  $("accountEmail").textContent = currentUser.email;
  $("accountRole").textContent = currentUser.role;
  $("accountCreated").textContent = new Date(currentUser.createdAt).toLocaleDateString();
  $("adminPanel").classList.toggle("hidden", currentUser.role !== "admin");
  if (currentUser.role === "admin") {
    try {
      const data = await api("/api/admin/overview");
      $("totalUsers").textContent = data.totalUsers;
      $("totalAdmins").textContent = data.admins;
      $("usersTable").innerHTML = data.recentUsers.map(u =>
        `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td></tr>`
      ).join("");
    } catch (err) { toast(err.message); }
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
async function refreshStatus() {
  $("statusTitle").textContent = "Checking server…";
  $("statusDescription").textContent = "Getting the latest status.";
  $("statusBadge").textContent = "CHECKING";
  try {
    const s = await api("/api/server-status");
    if (!s.configured) {
      $("statusSymbol").textContent = "☁";
      $("statusTitle").textContent = "Server not configured";
      $("statusDescription").textContent = s.message;
      $("statusBadge").textContent = "SETUP NEEDED";
      $("statusBadge").className = "status-badge";
      return;
    }
    $("statusSymbol").textContent = s.online ? "✓" : "×";
    $("statusTitle").textContent = s.online ? "Server is online" : "Server is offline";
    $("statusDescription").textContent = s.online
      ? `${s.host} · ${s.players ? `${s.players.online}/${s.players.max} players` : "Players unavailable"}${s.version ? ` · ${s.version}` : ""}`
      : `${s.host || ""} ${s.message || "No response from the status service."}`;
    $("statusBadge").textContent = s.online ? "ONLINE" : "OFFLINE";
    $("statusBadge").className = `status-badge${s.online ? " online" : ""}`;
  } catch {
    $("statusTitle").textContent = "Status unavailable";
    $("statusDescription").textContent = "Could not contact the status endpoint.";
    $("statusBadge").textContent = "UNKNOWN";
  }
}
async function loadUser() {
  try { currentUser = (await api("/api/me")).user; }
  catch { currentUser = null; }
  updateNav();
  await renderDashboard();
}
$("navLogin").addEventListener("click", () => openAuth("login"));
$("navSignup").addEventListener("click", () => openAuth("signup"));
$("heroSignup").addEventListener("click", () => openAuth("signup"));
$("navDashboard").addEventListener("click", () => $("accountArea").scrollIntoView({ behavior: "smooth" }));
$("navLogout").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); currentUser = null; updateNav(); toast("You have logged out."); }
  catch (err) { toast(err.message); }
});
$("closeModal").addEventListener("click", closeAuth);
$("modalBackdrop").addEventListener("click", closeAuth);
$("switchAuth").addEventListener("click", () => openAuth(authMode === "signup" ? "login" : "signup"));
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("authSubmit").disabled = true;
  $("authMessage").textContent = "";
  const body = {
    name: $("name").value.trim(),
    email: $("email").value.trim(),
    password: $("password").value
  };
  try {
    const data = await api(`/api/auth/${authMode}`, { method: "POST", body: JSON.stringify(body) });
    currentUser = data.user;
    closeAuth();
    updateNav();
    await renderDashboard();
    if (selectedLesson !== "Cloudy Playz lesson") {
      const selectedButton = document.querySelector(`[data-lesson="${CSS.escape(selectedLesson)}"]`);
      if (selectedButton) { $("paymentAmount").value = selectedButton.dataset.price; $("paymentMessage").textContent = `Selected: ${selectedLesson}. Review the amount and continue to checkout.`; }
    }
    $("accountArea").scrollIntoView({ behavior: "smooth" });
    toast(authMode === "signup" ? "Account created successfully." : "Welcome back!");
  } catch (err) { $("authMessage").textContent = err.message; }
  finally { $("authSubmit").disabled = false; }
});
$("refreshStatus").addEventListener("click", refreshStatus);
document.querySelectorAll(".lesson-buy").forEach(button => button.addEventListener("click", () => {
  selectedLesson = button.dataset.lesson;
  if (!currentUser) {
    openAuth("signup");
    toast(`Create an account to continue: ${selectedLesson}`);
    return;
  }
  $("paymentAmount").value = button.dataset.price;
  $("paymentMessage").textContent = `Selected: ${selectedLesson}. Continue to checkout when ready.`;
  $("accountArea").scrollIntoView({ behavior: "smooth" });
}));
$("payButton").addEventListener("click", async () => {
  const amount = Number($("paymentAmount").value);
  $("payButton").disabled = true;
  $("paymentMessage").textContent = "Preparing secure checkout…";
  try {
    const order = await api("/api/payments/order", { method: "POST", body: JSON.stringify({ amount }) });
    if (!window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => startCheckout(order);
      script.onerror = () => { $("paymentMessage").textContent = "Could not load Razorpay checkout."; $("payButton").disabled = false; };
      document.head.appendChild(script);
    } else startCheckout(order);
  } catch (err) {
    $("paymentMessage").textContent = err.message;
    $("payButton").disabled = false;
  }
});
function startCheckout(order) {
  const checkout = new window.Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: "Cloudy Playz",
    description: selectedLesson,
    order_id: order.orderId,
    handler: async (response) => {
      try {
        const result = await api("/api/payments/verify", { method: "POST", body: JSON.stringify(response) });
        $("paymentMessage").textContent = result.message || "Payment verified.";
      } catch (err) { $("paymentMessage").textContent = err.message; }
      $("payButton").disabled = false;
    },
    modal: { ondismiss: () => { $("payButton").disabled = false; $("paymentMessage").textContent = "Checkout closed."; } },
    theme: { color: "#4c9b32" }
  });
  checkout.on("payment.failed", () => {
    $("paymentMessage").textContent = "Payment did not complete. Please try again.";
    $("payButton").disabled = false;
  });
  checkout.open();
}
$("year").textContent = new Date().getFullYear();
loadUser();
refreshStatus();
setInterval(refreshStatus, 60000);
