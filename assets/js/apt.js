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

// Copy command function
function copyCommand(id, button) {
  const code = document.getElementById(id);
  const text = code.textContent;

  navigator.clipboard.writeText(text).then(() => {
    button.textContent = "Copied!";
    button.classList.add("copied");

    setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("copied");
    }, 2000);
  });
}

// Dynamic file listing via GitHub API with rate limiting
const fileListBody = document.getElementById("file-list");
const subtitle = document.querySelector(".subtitle");
const repo = "Kivot-OS/KivotOS-repo";
const BRANCH = "gh-pages"; // GitHub Pages branch where apt files are served from

// Cache management for API rate limiting
const CACHE_KEY = "kivotos_api_cache";
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

async function loadDirectory(path) {
  // Normalize path: remove leading/trailing slashes, fix double slashes
  const cleanPath = path.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
  
  // API path is the same as cleanPath (files are at root of gh-pages branch)
  const apiPath = cleanPath;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${apiPath}?ref=${BRANCH}`;

  subtitle.textContent = `Browse repository${cleanPath ? `/${cleanPath}` : ""}`;

  // Check cache first
  const cachedData = getCache(apiPath);
  if (cachedData) {
    displayDirectory(cachedData, cleanPath, path);
    return;
  }

  fileListBody.innerHTML = `<tr><td colspan="3" class="loading-message">Loading repository contents...</td></tr>`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    // Check rate limit
    const remaining = response.headers.get("x-ratelimit-remaining");
    const limit = response.headers.get("x-ratelimit-limit");
    if (remaining) {
      console.log(
        `GitHub API rate limit: ${remaining}/${limit} requests remaining`
      );
      if (parseInt(remaining) < 10) {
        console.warn(
          "Low on API rate limit! Consider waiting before more requests."
        );
      }
    }
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          "GitHub API rate limit exceeded. Please wait a moment and try again."
        );
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const items = await response.json();

    // Cache the data using apiPath as key
    setCache(apiPath, items);

    displayDirectory(items, cleanPath, path);
  } catch (error) {
    console.error("Failed to load directory:", error);
    fileListBody.innerHTML = `<tr><td colspan="3" class="loading-message">${
      error.message || "Failed to load repository contents."
    }</td></tr>`;
  }
}

function displayDirectory(items, cleanPath, path) {
  fileListBody.innerHTML = ""; // Clear loading message

  // Parent directory link - only show if we're not at root
  if (cleanPath) {
    // Go up one level
    const lastSlashIndex = cleanPath.lastIndexOf("/");
    const parentPath = lastSlashIndex >= 0 ? cleanPath.substring(0, lastSlashIndex) : "/";
    const parentRow = document.createElement("tr");
    parentRow.innerHTML = `
            <td>
                <span class="file-icon">📁</span>
                <a href="${parentPath === "" ? "/" : parentPath + "/"}" class="file-link parent-link">..</a>
            </td>
            <td class="hide-mobile">-</td>
            <td class="hide-mobile">-</td>
        `;
    fileListBody.appendChild(parentRow);
  }

  // Sort items: directories first, then files, all alphabetically
  items.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === "dir" ? -1 : 1;
  });

  // Filter out unwanted files
  const ignoredFiles = [".nojekyll", "index.html", "404.html", "CNAME"];
  items = items.filter(item => !ignoredFiles.includes(item.name) && !item.name.startsWith("."));

  items.forEach((item) => {
    const isDirectory = item.type === "dir";
    // Build the path for navigation
    const itemPath = isDirectory
      ? `${cleanPath ? cleanPath + "/" : ""}${item.name}/`
      : item.download_url;
    const row = document.createElement("tr");
    row.innerHTML = `
            <td>
                <span class="file-icon">${
                  isDirectory ? "📁" : "📄"
                }</span>
                <a href="${itemPath}" class="file-link">${item.name}</a>
            </td>
            <td class="hide-mobile">-</td>
            <td class="hide-mobile">-</td>
        `;
    fileListBody.appendChild(row);
  });
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
const initialPath =
  new URLSearchParams(window.location.search).get("path") || "/";
history.replaceState({ path: initialPath }, "", `?path=${initialPath}`);
loadDirectory(initialPath);
