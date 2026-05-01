// Theme management
const html = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme") || "light";
html.setAttribute("data-theme", savedTheme);

themeToggle.addEventListener("click", () => {
  const currentTheme = html.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon();
});

function updateThemeIcon() {
  const currentTheme = html.getAttribute("data-theme");
  const img = themeToggle.querySelector("img");
  img.src =
    currentTheme === "dark" ? "./assets/moon.svg" : "./assets/sun.svg";
}

updateThemeIcon();

// Clipboard helper — works in HTTPS, http, and file:// contexts
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy") ? resolve() : reject();
    } catch (e) {
      reject(e);
    } finally {
      document.body.removeChild(ta);
    }
  });
}

// Copy command function — wired via data-copy-id attribute
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-btn[data-copy-id]");
  if (!btn) return;
  const code = document.getElementById(btn.dataset.copyId);
  if (!code) return;
  const text = code.textContent.trim();

  copyToClipboard(text).then(() => {
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("copied");
    }, 2000);
  }).catch(() => {
    btn.textContent = "Failed";
    setTimeout(() => { btn.textContent = "Copy"; }, 2000);
  });
});

// Dynamic file listing via Cloudflare Worker
const fileListBody = document.getElementById("file-list");
const subtitle = document.querySelector(".subtitle");
const WORKER_BASE = "https://kivotos-repo.dungdinhmanh0209.workers.dev";

// Cache management
const CACHE_KEY = "kivotos_worker_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

function getCache(path) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const entry = cache[path];
    if (entry && Date.now() - entry.timestamp < CACHE_DURATION) {
      return entry.data;
    }
  } catch (e) {
    console.error("Cache read error:", e);
  }
  return null;
}

function setCache(path, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    cache[path] = {
      data: data,
      timestamp: Date.now(),
    };
    // Keep cache size reasonable (max 20 entries)
    const keys = Object.keys(cache);
    if (keys.length > 20) {
      delete cache[keys[0]];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Cache write error:", e);
  }
}

function formatFileSize(bytes) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

async function loadDirectory(path) {
  const cleanPath = path.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
  const prefix = cleanPath ? `${cleanPath}/` : "";
  const apiUrl = `${WORKER_BASE}/${prefix}?format=json`;

  subtitle.textContent = `Browse repository${cleanPath ? ` / ${cleanPath}` : ""}`;

  const cached = getCache(prefix);
  if (cached) {
    displayDirectory(cached, cleanPath);
    return;
  }

  fileListBody.innerHTML = `<tr><td colspan="3" class="loading-message">Loading repository contents...</td></tr>`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Worker error: ${response.status}`);
    const data = await response.json();
    setCache(prefix, data);
    displayDirectory(data, cleanPath);
  } catch (error) {
    console.error("Failed to load directory:", error);
    const errRow = document.createElement("tr");
    const errTd = document.createElement("td");
    errTd.colSpan = 3;
    errTd.className = "loading-message";
    errTd.textContent = error.message || "Failed to load repository contents.";
    errRow.appendChild(errTd);
    fileListBody.innerHTML = "";
    fileListBody.appendChild(errRow);
  }
}

function makeCell(className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  return td;
}

function displayDirectory(data, cleanPath) {
  fileListBody.innerHTML = "";

  if (cleanPath) {
    const lastSlash = cleanPath.lastIndexOf("/");
    const parentPath = lastSlash >= 0 ? cleanPath.substring(0, lastSlash) : "";
    const parentRow = document.createElement("tr");

    const td1 = makeCell(null);
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "folder");
    icon.className = "file-icon";
    const link = document.createElement("a");
    link.href = parentPath ? `/${parentPath}/` : "/";
    link.className = "file-link parent-link";
    link.textContent = "..";
    td1.appendChild(icon);
    td1.appendChild(link);

    const td2 = makeCell("hide-mobile"); td2.textContent = "-";
    const td3 = makeCell("hide-mobile"); td3.textContent = "-";
    parentRow.appendChild(td1);
    parentRow.appendChild(td2);
    parentRow.appendChild(td3);
    fileListBody.appendChild(parentRow);
  }

  (data.dirs || []).forEach(dir => {
    const dirHref = `/${cleanPath ? cleanPath + "/" : ""}${dir}`;
    const row = document.createElement("tr");

    const td1 = makeCell(null);
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "folder");
    icon.className = "file-icon";
    const link = document.createElement("a");
    link.href = dirHref;
    link.className = "file-link";
    link.textContent = dir;
    td1.appendChild(icon);
    td1.appendChild(link);

    const td2 = makeCell("hide-mobile"); td2.textContent = "-";
    const td3 = makeCell("hide-mobile"); td3.textContent = "-";
    row.appendChild(td1);
    row.appendChild(td2);
    row.appendChild(td3);
    fileListBody.appendChild(row);
  });

  (data.files || []).forEach(file => {
    const fileUrl = `${WORKER_BASE}/${cleanPath ? cleanPath + "/" : ""}${file.name}`;
    const row = document.createElement("tr");

    const td1 = makeCell(null);
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "file");
    icon.className = "file-icon";
    const link = document.createElement("a");
    link.href = fileUrl;
    link.className = "file-link";
    link.textContent = file.name;
    td1.appendChild(icon);
    td1.appendChild(link);

    const td2 = makeCell("hide-mobile");
    td2.textContent = file.modified
      ? new Date(file.modified).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : "-";

    const td3 = makeCell("hide-mobile");
    td3.textContent = formatFileSize(file.size);

    row.appendChild(td1);
    row.appendChild(td2);
    row.appendChild(td3);
    fileListBody.appendChild(row);
  });

  if (!data.dirs?.length && !data.files?.length && !cleanPath) {
    const emptyRow = document.createElement("tr");
    const td = makeCell(null);
    td.colSpan = 3;
    td.className = "loading-message";
    td.textContent = "Repository is empty.";
    emptyRow.appendChild(td);
    fileListBody.appendChild(emptyRow);
  }

  if (window.lucide) lucide.createIcons();
}

// Handle clicks to navigate
document.addEventListener("click", (e) => {
  const link = e.target.closest(".file-link");
  if (link) {
    e.preventDefault();
    const path = link.getAttribute("href");
    const isFile = !path.endsWith("/");

    if (isFile) {
      window.open(path, "_blank"); // Open download URL directly
    } else {
      history.pushState({ path }, "", `?path=${path}`);
      loadDirectory(path);
    }
  }
});

// Handle browser back/forward
window.addEventListener("popstate", (e) => {
  const path = e.state && e.state.path ? e.state.path : "/";
  loadDirectory(path);
});

// Initial load
if (window.lucide) lucide.createIcons();
const initialPath =
  new URLSearchParams(window.location.search).get("path") || "/";
history.replaceState({ path: initialPath }, "", `?path=${initialPath}`);
loadDirectory(initialPath);
