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
});

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

function formatDuration(ms) {
  if (ms <= 0 || ms >= 3600000) return "N/A";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Cache management for API rate limiting
const apiCache = {
  build: { data: null, timestamp: 0 },
};
const CACHE_DURATION = 60000; // 1 minute cache

// Fetch last 30 build runs and render chart
async function fetchBuildHistory() {
  const chartEl = document.getElementById("build-chart");
  const successRateEl = document.getElementById("build-success-rate");
  const avgTimeEl = document.getElementById("avg-build-time");
  const buildStatusEl = document.getElementById("build-status");

  const now = Date.now();
  if (apiCache.build.data && now - apiCache.build.timestamp < CACHE_DURATION) {
    renderBuildChart(apiCache.build.data, chartEl, successRateEl, avgTimeEl, buildStatusEl);
    return;
  }

  try {
    const response = await fetch(
      "https://api.github.com/repos/Kivot-OS/KivotOS-repo/actions/workflows/build.yml/runs?per_page=30",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining && parseInt(remaining) < 10) {
      console.warn(`GitHub API rate limit low: ${remaining} requests remaining`);
    }

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

    const data = await response.json();
    apiCache.build.data = data;
    apiCache.build.timestamp = now;

    renderBuildChart(data, chartEl, successRateEl, avgTimeEl, buildStatusEl);
  } catch (error) {
    console.error("Error fetching build history:", error);
    if (chartEl) chartEl.innerHTML = '<div class="loading-message">Failed to load build history</div>';
    if (successRateEl) successRateEl.textContent = "N/A";
    if (avgTimeEl) avgTimeEl.textContent = "N/A";
    if (buildStatusEl) {
      buildStatusEl.textContent = "Unavailable";
      buildStatusEl.style.color = "var(--text-secondary)";
    }
  }
}

function renderBuildChart(data, chartEl, successRateEl, avgTimeEl, buildStatusEl) {
  const runs = (data.workflow_runs || []).slice(0, 30);

  if (!runs.length) {
    if (chartEl) chartEl.innerHTML = '<div class="loading-message">No builds found</div>';
    return;
  }

  if (buildStatusEl) displayBuildStatus({ workflow_runs: [runs[0]] }, buildStatusEl);

  const completed = runs.filter(r => r.status === "completed");
  const successes = completed.filter(r => r.conclusion === "success");
  const durations = completed
    .map(r => new Date(r.updated_at) - new Date(r.created_at))
    .filter(d => d > 0 && d < 3600000);

  if (successRateEl) {
    const rate = completed.length ? Math.round((successes.length / completed.length) * 100) : null;
    successRateEl.textContent = rate !== null
      ? `${rate}% (${successes.length}/${completed.length} runs)`
      : "N/A";
    successRateEl.style.color = rate !== null
      ? (rate >= 80 ? "var(--ctp-green)" : rate >= 50 ? "var(--ctp-yellow)" : "var(--ctp-red)")
      : "var(--text-secondary)";
  }

  if (avgTimeEl) {
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    avgTimeEl.textContent = avgMs > 0 ? formatDuration(avgMs) : "N/A";
  }

  if (!chartEl) return;
  chartEl.innerHTML = "";

  const CHART_H = 90;
  const MIN_H = 6;
  const maxDur = Math.max(...durations, 1);

  let tipEl = document.getElementById("build-tooltip");
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.id = "build-tooltip";
    tipEl.className = "build-tooltip";
    document.body.appendChild(tipEl);
  }

  [...runs].reverse().forEach(run => {
    const dur = new Date(run.updated_at) - new Date(run.created_at);
    const isSuccess = run.conclusion === "success";
    const isFailure = run.conclusion === "failure";
    const isRunning = run.status === "in_progress" || run.status === "queued";

    const barH = dur > 0 && dur < 3600000
      ? Math.max(MIN_H, Math.round((dur / maxDur) * CHART_H))
      : MIN_H;

    const colorClass = isSuccess ? "success" : isFailure ? "failure"
      : isRunning ? "running" : "neutral";

    const slot = document.createElement("div");
    slot.className = "build-bar-slot";

    const bar = document.createElement("div");
    bar.className = `build-bar build-bar--${colorClass}`;
    bar.style.height = `${barH}px`;

    const dot = document.createElement("div");
    dot.className = "build-bar-dot";
    bar.appendChild(dot);
    slot.appendChild(bar);

    const conclText = run.conclusion
      ? run.conclusion.charAt(0).toUpperCase() + run.conclusion.slice(1)
      : (isRunning ? "Running" : "Queued");
    const durStr = dur > 0 && dur < 3600000 ? formatDuration(dur) : (isRunning ? "Running…" : "N/A");
    const dateStr = new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    slot.addEventListener("mouseenter", () => {
      const barRect = bar.getBoundingClientRect();
      tipEl.innerHTML = `<strong>#${run.run_number}</strong><br>${conclText}<br>${durStr}<br>${dateStr}`;
      tipEl.style.display = "block";
      tipEl.style.opacity = "0";
      const tipW = tipEl.offsetWidth;
      const tipH = tipEl.offsetHeight;
      let left = barRect.left + barRect.width / 2 - tipW / 2;
      let top = barRect.top - tipH - 8;
      left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
      tipEl.style.left = `${left}px`;
      tipEl.style.top = `${Math.max(8, top)}px`;
      tipEl.style.opacity = "1";
    });

    slot.addEventListener("mouseleave", () => { tipEl.style.display = "none"; });
    slot.addEventListener("click", () => window.open(run.html_url, "_blank", "noopener,noreferrer"));

    chartEl.appendChild(slot);
  });
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
    const ghHeaders = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const [response, lockResponse] = await Promise.all([
      fetch(apiUrl, { headers: ghHeaders }),
      fetch("https://raw.githubusercontent.com/Kivot-OS/KivotOS-repo/main/packages.lock")
        .catch(() => null),
    ]);

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
      if (lockResponse && lockResponse.ok) {
        const lockContent = await lockResponse.text();
        lockVersions = parsePackagesLock(lockContent);
      }
    } catch (e) {
      console.warn("Could not parse packages.lock:", e);
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

      const infoDiv = document.createElement("div");

      const nameDiv = document.createElement("div");
      nameDiv.className = "package-name";
      nameDiv.textContent = name;

      const descDiv = document.createElement("div");
      descDiv.className = "package-desc";
      descDiv.textContent = description;

      const badge = document.createElement("span");
      badge.className = "version-badge";
      badge.title = `Type: ${pkgType}`;
      badge.textContent = version;

      infoDiv.appendChild(nameDiv);
      infoDiv.appendChild(descDiv);
      item.appendChild(infoDiv);
      item.appendChild(badge);

      if (homepage !== '#') {
        item.style.cursor = "pointer";
        item.addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = homepage;
          a.rel = "noopener noreferrer";
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      }

      container.appendChild(item);
    });

    updateInstallCommand(packages);
    if (window.lucide) lucide.createIcons();

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

// Footer year
const yearEl = document.getElementById("footer-year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Initialize
if (window.lucide) lucide.createIcons();
fetchBuildHistory();
updatePackageList();
