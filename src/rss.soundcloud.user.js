// ==UserScript==
// @name         SoundCloud RSS Feed
// @namespace    https://github.com/26d0/userscripts
// @version      0.3.0
// @description  Get RSS feed URL for SoundCloud user pages
// @match        https://soundcloud.com/*
// @grant        none
// @icon         https://a-v2.sndcdn.com/assets/images/sc-icons/favicon-2cadd14bdb.ico
// ==/UserScript==

(function () {
  "use strict";

  // ===================
  // Icons
  // ===================

  const ICONS = {
    rss: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#f70" stroke="none">
      <circle cx="6.18" cy="17.82" r="2.18"/>
      <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z"/>
    </svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`,
  };

  // ===================
  // User ID Cache
  // username -> id, populated by fetch intercept
  // ===================

  const userIdCache = {};

  const origFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await origFetch(...args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "");
      if (url.includes("api-v2.soundcloud.com") && response.ok) {
        response.clone().json().then((data) => {
          // Single user object
          if (data?.kind === "user" && data.id && data.permalink) {
            userIdCache[data.permalink] = String(data.id);
            console.log("[RSS] Cached user ID:", data.id, "->", data.permalink);
          }
          // Collection containing user objects (e.g. search results, followers)
          if (Array.isArray(data?.collection)) {
            for (const item of data.collection) {
              if (item?.kind === "user" && item.id && item.permalink) {
                userIdCache[item.permalink] = String(item.id);
              }
            }
          }
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // ===================
  // Utility Functions
  // ===================

  function isUserPage() {
    const excludedPaths = [
      "/you", "/stations", "/discover", "/stream", "/upload",
      "/search", "/settings", "/messages", "/notifications",
      "/charts", "/people", "/pages", "/pro", "/jobs",
      "/creators", "/terms-of-use", "/privacy",
    ];
    const pathname = location.pathname;
    for (const excluded of excludedPaths) {
      if (pathname.startsWith(excluded)) return false;
    }
    const match = pathname.match(/^\/([^/]+)/);
    return match ? match[1].length > 0 : false;
  }

  function currentUsername() {
    const match = location.pathname.match(/^\/([^/]+)/);
    return match ? match[1] : null;
  }

  function findButtonContainer() {
    const selectors = [
      ".userInfoBar__buttons .sc-button-group",
      ".profileHeaderInfo__buttons .sc-button-group",
      ".userMain__headerButtons .sc-button-group",
      ".soundHeader__actions .sc-button-group",
      ".header__actions .sc-button-group",
      ".sc-button-group:has(.sc-button-follow)",
      ".sc-button-group:has(.sc-button-station)",
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function extractUserId() {
    const username = currentUsername();

    // 1. fetch intercept cache (most accurate for SPA)
    if (username && userIdCache[username]) {
      return userIdCache[username];
    }

    // 2. app-link meta tags (updated by React Helmet on SPA nav)
    for (const prop of ["al:ios:url", "al:android:url"]) {
      const meta = document.querySelector(`meta[property="${prop}"]`);
      if (meta) {
        const m = meta.getAttribute("content").match(/soundcloud:\/\/users:(\d+)/);
        if (m) return m[1];
      }
    }

    // 3. window.__sc_hydration (reliable on hard load, stale on SPA nav)
    if (window.__sc_hydration) {
      const entry = window.__sc_hydration.find((e) => e.hydratable === "user");
      if (entry?.data?.id) return String(entry.data.id);
    }

    return null;
  }

  function buildRssFeedUrl(userId) {
    return `http://feeds.soundcloud.com/users/soundcloud:users:${userId}/sounds.rss`;
  }

  // ===================
  // Button
  // ===================

  const btn = document.createElement("button");
  btn.innerHTML = ICONS.rss;
  btn.title = "Copy RSS feed URL";
  btn.classList.add("sc-button", "sc-button-medium", "sc-button-icon", "sc-button-responsive", "sc-button-secondary");

  btn.addEventListener("click", async () => {
    const userId = extractUserId();
    if (!userId) {
      console.warn("[RSS] Could not find user ID for:", currentUsername());
      btn.innerHTML = ICONS.error;
      setTimeout(() => { btn.innerHTML = ICONS.rss; }, 2000);
      return;
    }

    const rssUrl = buildRssFeedUrl(userId);
    console.log("[RSS] RSS Feed URL:", rssUrl);

    try {
      await navigator.clipboard.writeText(rssUrl);
      btn.innerHTML = ICONS.check;
    } catch (err) {
      console.error("[RSS] Failed to copy to clipboard:", err);
      btn.innerHTML = ICONS.error;
    }

    setTimeout(() => { btn.innerHTML = ICONS.rss; }, 2000);
  });

  // ===================
  // DOM Insertion
  // ===================

  function update() {
    if (!isUserPage()) {
      btn.remove();
      return;
    }
    const par = findButtonContainer();
    if (par && btn.parentElement !== par) {
      par.insertAdjacentElement("beforeend", btn);
      console.log("[RSS] Button inserted for:", currentUsername());
    }
  }

  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true });

  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    update();
  };
  window.addEventListener("popstate", update);

  update();
})();
