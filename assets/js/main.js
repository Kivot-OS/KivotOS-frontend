// KivotOS Repository Frontend JavaScript

// Theme toggle
const themeToggle = document.getElementById("themeToggle");
const html = document.documentElement;

// Load saved theme
const savedTheme = localStorage.getItem("theme") || "light";
html.setAttribute("data-theme", savedTheme);

themeToggle.addEventListener("click", () => {
  const currentTheme = html.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  html.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);

  updateStatusColors();
});

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

function updateStatusColors() {
  const uptimeUrl =
    "https://raw.githubusercontent.com/Kivot-OS/KivotOS-status/master/api/kivot-os-apt-repository/uptime.json";
  const responseTimeUrl =
    "https://raw.githubusercontent.com/Kivot-OS/KivotOS-status/master/api/kivot-os-apt-repository/response-time.json";

  const uptimeElement = document.getElementById("uptime-status");
  const responseTimeElement = document.getElementById(
    "response-time-status"
  );

  fetch(uptimeUrl)
    .then((response) => response.json())
    .then((data) => {
      if (data && data.message) {
        uptimeElement.textContent = data.message;
        uptimeElement.style.color = data.color || "var(--text-primary)";
      }
    })
    .catch((error) => {
      console.error("Error fetching uptime status:", error);
      uptimeElement.textContent = "N/A";
    });

  fetch(responseTimeUrl)
    .then((response) => response.json())
    .then((data) => {
      if (data && data.message) {
        responseTimeElement.textContent = data.message;
        responseTimeElement.style.color = "var(--ctp-green)";
      }
    })
    .catch((error) => {
      console.error("Error fetching response time status:", error);
      responseTimeElement.textContent = "N/A";
    });
}

updateStatusColors();

// Format time helper
function formatBuildTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;

  const time24h = date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return `Today at ${time24h}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${time24h}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago at ${time24h}`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
}

// Cache management for API rate limiting
const apiCache = {
  build: { data: null, timestamp: 0 },
  status: { data: null, timestamp: 0 },
};
const CACHE_DURATION = 60000; // 1 minute cache

// Fetch GitHub workflow status with caching
async function updateBuildStatus() {
  const buildStatusElement = document.getElementById("build-status");

  const now = Date.now();
  if (
    apiCache.build.data &&
    now - apiCache.build.timestamp < CACHE_DURATION
  ) {
    displayBuildStatus(
      apiCache.build.data,
      buildStatusElement
    );
    return;
  }

  try {
    const response = await fetch(
      "https://api.github.com/repos/Kivot-OS/KivotOS-repo/actions/workflows/apt-packages.yml/runs?per_page=1",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining && parseInt(remaining) < 10) {
      console.warn(
        `GitHub API rate limit low: ${remaining} requests remaining`
      );
    }

    const data = await response.json();

    apiCache.build.data = data;
    apiCache.build.timestamp = now;

    displayBuildStatus(data, buildStatusElement);
  } catch (error) {
    console.error("Error fetching build status:", error);
    buildStatusElement.textContent = "Unavailable";
    buildStatusElement.style.color = "var(--text-secondary)";
  }
}

function displayBuildStatus(data, element) {
  if (data.workflow_runs && data.workflow_runs.length > 0) {
    const latestRun = data.workflow_runs[0];
    const status = latestRun.status;
    const conclusion = latestRun.conclusion;
    const timeInfo = formatBuildTime(latestRun.created_at);

    let statusText = "";
    let statusColor = "";

    if (status === "in_progress" || status === "queued") {
      statusText = `Running (${timeInfo})`;
      statusColor = "var(--ctp-yellow)";
    } else if (status === "completed") {
      if (conclusion === "success") {
        statusText = `Passed (${timeInfo})`;
        statusColor = "var(--ctp-green)";
      } else if (conclusion === "failure") {
        statusText = `Failed (${timeInfo})`;
        statusColor = "var(--ctp-red)";
      } else {
        statusText = `Unknown (${timeInfo})`;
        statusColor = "var(--text-secondary)";
      }
    } else {
      statusText = `Pending (${timeInfo})`;
      statusColor = "var(--text-secondary)";
    }

    element.textContent = statusText;
    element.style.color = statusColor;
  } else {
    element.textContent = "No builds found";
    element.style.color = "var(--text-secondary)";
  }
}

// Simple TOML parser for basic key-value pairs
function parseTOML(content) {
  const result = {};
  let currentSection = result;
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const sectionPath = trimmed.slice(1, -1);
      const parts = sectionPath.split('.');
      let target = result;
      for (const part of parts) {
        if (!target[part]) target[part] = {};
        target = target[part];
      }
      currentSection = target;
      continue;
    }
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      else if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = value.slice(1, -1).split(',').map(s => {
            s = s.trim();
            if ((s.startsWith('"') && s.endsWith('"')) ||
                (s.startsWith("'") && s.endsWith("'"))) {
              return s.slice(1, -1);
            }
            return s;
          }).filter(s => s);
        } catch (e) {
          value = [];
        }
      }
      
      currentSection[key] = value;
    }
  }
  
  return result;
}

// Parse packages.lock file
function parsePackagesLock(content) {
  const versions = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const pkgName = trimmed.slice(0, eqIndex).trim();
      const version = trimmed.slice(eqIndex + 1).trim();
      versions[pkgName] = version;
    }
  }
  
  return versions;
}

// Auto-refresh package list from packages/*.toml files
async function updatePackageList() {
  const container = document.getElementById("package-grid");
  
  try {
    const apiUrl = "https://api.github.com/repos/Kivot-OS/KivotOS-repo/contents/packages?ref=main";
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const files = await response.json();
    const tomlFiles = files.filter(f => f.name.endsWith('.toml'));
    
    if (tomlFiles.length === 0) {
      container.innerHTML = '<div class="loading-message">No packages found</div>';
      return;
    }

    let lockVersions = {};
    try {
      const lockResponse = await fetch(
        "https://raw.githubusercontent.com/Kivot-OS/KivotOS-repo/main/packages.lock"
      );
      if (lockResponse.ok) {
        const lockContent = await lockResponse.text();
        lockVersions = parsePackagesLock(lockContent);
      }
    } catch (e) {
      console.warn("Could not fetch packages.lock:", e);
    }

    const packagePromises = tomlFiles.map(async (file) => {
      try {
        const tomlResponse = await fetch(file.download_url);
        if (!tomlResponse.ok) return null;
        const tomlContent = await tomlResponse.text();
        const pkg = parseTOML(tomlContent);
        return pkg;
      } catch (e) {
        console.error(`Failed to parse ${file.name}:`, e);
        return null;
      }
    });

    const packages = (await Promise.all(packagePromises)).filter(p => p !== null);
    
    window.availablePackages = packages;

    container.innerHTML = "";

    if (packages.length === 0) {
      container.innerHTML = '<div class="loading-message">No packages found</div>';
      return;
    }

    packages.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    packages.forEach((pkg) => {
      const name = pkg.name || 'Unknown';
      const description = pkg.description || 'No description';
      const pkgType = pkg.type || 'unknown';
      const homepage = pkg.homepage || '#';
      
      const version = lockVersions[name] || (pkg.version === 'latest' ? 'latest' : pkg.version || 'latest');

      const item = document.createElement("div");
      item.className = "package-item";
      item.innerHTML = `
        <div>
          <div class="package-name">${name}</div>
          <div class="package-desc">${description}</div>
        </div>
        <span class="version-badge" title="Type: ${pkgType}">${version}</span>
      `;

      if (homepage !== '#') {
        item.style.cursor = "pointer";
        item.onclick = () => window.open(homepage, "_blank");
      }

      container.appendChild(item);
    });

    updateInstallCommand(packages);

  } catch (error) {
    console.error("Error fetching packages:", error);
    container.innerHTML = '<div class="loading-message" style="color: var(--ctp-red)">Failed to load packages</div>';
  }
}

// Update the install command to show actual available packages
function updateInstallCommand(packages) {
  const cmd3 = document.getElementById("cmd3");
  const packageNames = packages
    .map(p => p.name)
    .filter(n => n)
    .join(' ');
  
  if (packageNames) {
    cmd3.textContent = `sudo apt update\nsudo apt install ${packageNames}`;
  }
}

// Initialize
updateBuildStatus();
updatePackageList();
