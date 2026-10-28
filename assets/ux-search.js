/* LEAP search assistance: local suggestions; learning data stays untouched. */
(function () {
  "use strict";
  const root = document.getElementById("section-wordlist");
  if (!root) return;
  const HISTORY_KEY = "leap_search_recent_v1";
  const LIMIT = 7;
  const bound = new WeakSet();
  let active = null;
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const normalize = (value) => String(value).trim().toLocaleLowerCase();
  function readRecent() {
    try {
      const rows = JSON.parse(localStorage.getItem(HISTORY_KEY));
      return Array.isArray(rows)
        ? rows
            .filter(
              (x) => x && typeof x.term === "string" && x.term.length <= 100,
            )
            .map((x) => ({
              term: x.term,
              count: Math.max(1, Math.min(999, Number(x.count) || 1)),
              at: Number(x.at) || 0,
            }))
            .slice(0, 12)
        : [];
    } catch (_) {
      return [];
    }
  }
  function remember(value) {
    const term = String(value).trim().slice(0, 100);
    if (!term) return;
    const old = readRecent(),
      found = old.find((x) => normalize(x.term) === normalize(term));
    const next = [
      { term, count: found ? found.count + 1 : 1, at: Date.now() },
      ...old.filter((x) => normalize(x.term) !== normalize(term)),
    ].slice(0, 12);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch (_) {
      /* History is optional. */
    }
  }
  function suggest(value) {
    const query = normalize(value),
      recent = readRecent();
    if (!query)
      return recent
        .slice()
        .sort((a, b) => b.at - a.at)
        .slice(0, LIMIT)
        .map((x) => ({ term: x.term, subtitle: "最近の検索", recent: true }));
    const ranked = [];
    for (const word of WORDS) {
      const english = normalize(word.word),
        matchesWord = english.includes(query);
      if (
        !matchesWord &&
        !word.meanings.some((m) => normalize(m).includes(query))
      )
        continue;
      const past = recent.find((x) => normalize(x.term) === english);
      ranked.push({
        term: word.word,
        subtitle: "No." + word.no + " · " + word.meanings.join(" / "),
        rank:
          english === query
            ? 0
            : english.startsWith(query)
              ? 1
              : matchesWord
                ? 2
                : 3,
        count: past ? past.count : 0,
        no: word.no,
      });
    }
    return ranked
      .sort((a, b) => a.rank - b.rank || b.count - a.count || a.no - b.no)
      .slice(0, LIMIT);
  }
  function bind() {
    const input = root.querySelector("#list-search-input");
    if (!input || bound.has(input)) return;
    if (active) active.close();
    bound.add(input);
    const wrapper = document.createElement("div");
    wrapper.className = "ux-search";
    input.before(wrapper);
    wrapper.append(input);
    const list = document.createElement("div");
    list.id = "ux-search-options";
    list.className = "ux-search-options";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "検索候補");
    list.hidden = true;
    const status = document.createElement("span");
    status.className = "ux-search-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    wrapper.append(list, status);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("enterkeyhint", "search");
    input.setAttribute("spellcheck", "false");
    let items = [],
      index = -1,
      composing = false,
      blurTimer = null,
      queryTimer = null;
    function close() {
      clearTimeout(blurTimer);
      clearTimeout(queryTimer);
      list.hidden = true;
      index = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    function position() {
      if (list.hidden || !input.isConnected) return;
      const rect = wrapper.getBoundingClientRect(),
        viewport = window.visualViewport;
      const bottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const above = rect.top - (viewport ? viewport.offsetTop : 0) - 12,
        below = bottom - rect.bottom - 12;
      const flip = below < 160 && above > below;
      wrapper.classList.toggle("ux-search-above", flip);
      list.style.maxHeight =
        Math.max(80, Math.min(320, flip ? above : below)) + "px";
    }
    function selectIndex(next) {
      index = next;
      list.querySelectorAll('[role="option"]').forEach((option, i) => {
        option.setAttribute("aria-selected", String(i === index));
        if (i === index) {
          input.setAttribute("aria-activedescendant", option.id);
          // Scroll the popup alone; do not move the document or dismiss the keyboard.
          if (option.offsetTop < list.scrollTop)
            list.scrollTop = option.offsetTop;
          else if (
            option.offsetTop + option.offsetHeight >
            list.scrollTop + list.clientHeight
          )
            list.scrollTop =
              option.offsetTop + option.offsetHeight - list.clientHeight;
        }
      });
    }
    function render() {
      if (composing || !input.isConnected || document.activeElement !== input)
        return;
      items = suggest(input.value);
      index = -1;
      input.removeAttribute("aria-activedescendant");
      if (!items.length && !normalize(input.value)) {
        close();
        return;
      }
      const heading = normalize(input.value) ? "検索候補" : "最近の検索";
      list.innerHTML =
        '<div class="ux-search-heading" role="presentation">' +
        heading +
        "</div>" +
        (items.length
          ? items
              .map(
                (item, i) =>
                  '<div class="ux-search-option" id="ux-search-option-' +
                  i +
                  '" role="option" aria-selected="false" tabindex="-1" data-ux-search-index="' +
                  i +
                  '"><span class="ux-search-term">' +
                  escape(item.term) +
                  '</span><span class="ux-search-meaning">' +
                  escape(item.subtitle) +
                  '</span><span class="ux-search-arrow" aria-hidden="true">↗</span></div>',
              )
              .join("")
          : '<div class="ux-search-empty" role="presentation">候補が見つかりません。入力内容や絞り込みを確認してください。</div>');
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      status.textContent = items.length
        ? items.length + "件の検索候補。上下キーで選択できます。"
        : "検索候補は0件です。";
      position();
    }
    function choose(i) {
      const item = items[i];
      if (!item) return;
      input.value = item.term;
      remember(item.term);
      close();
      listSearch(item.term);
      input.focus({ preventScroll: true });
      // Focus can reopen recent suggestions, so close after restoring keyboard focus.
      close();
      input.classList.remove("ux-search-picked");
      requestAnimationFrame(() => {
        if (input.isConnected) input.classList.add("ux-search-picked");
      });
      status.textContent = item.term + "で検索しました。";
    }
    input.addEventListener("focus", render);
    input.addEventListener("input", () => {
      if (composing) return;
      clearTimeout(queryTimer);
      queryTimer = setTimeout(render, 60);
    });
    input.addEventListener("compositionstart", () => {
      composing = true;
      close();
    });
    input.addEventListener("compositionend", () => {
      composing = false;
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (composing || e.isComposing || e.keyCode === 229) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (list.hidden) render();
        if (!items.length) return;
        e.preventDefault();
        selectIndex(
          e.key === "ArrowDown"
            ? (index + 1) % items.length
            : index < 0
              ? items.length - 1
              : (index + items.length - 1) % items.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!list.hidden && index >= 0) choose(index);
        else {
          remember(input.value);
          close();
          listSearch(input.value);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
    input.addEventListener("blur", () => {
      blurTimer = setTimeout(() => {
        if (!wrapper.contains(document.activeElement)) close();
      }, 120);
    });
    list.addEventListener("mousedown", (e) => {
      if (e.target.closest('[role="option"]')) e.preventDefault();
    });
    list.addEventListener("click", (e) => {
      const option = e.target.closest("[data-ux-search-index]");
      if (option) choose(Number(option.dataset.uxSearchIndex));
    });
    active = { input, wrapper, close, position, render };
  }
  document.addEventListener("pointerdown", (e) => {
    if (active && !active.wrapper.contains(e.target)) active.close();
  });
  window.addEventListener(
    "resize",
    () => {
      if (active) active.position();
    },
    { passive: true },
  );
  if (window.visualViewport)
    window.visualViewport.addEventListener(
      "resize",
      () => {
        if (active) active.position();
      },
      { passive: true },
    );
  new MutationObserver(bind).observe(root, { childList: true, subtree: true });
  bind();
  window.LEAPSearch = {
    bind,
    close: () => {
      if (active) active.close();
    },
  };
})();
