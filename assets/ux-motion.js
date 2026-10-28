/* Progressive motion layer. Teaching data and storage are never read or written here. */
(function () {
  "use strict";
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const active = new Set();
  const counts = new Set();
  const seen = new WeakSet();
  const values = new Map();
  const cardSelector =
    ".result-box, .score-card, .quiz-card, .set-card, .slot-card, .rec-card, .rec-tile, .stat-tile, .mode-option";
  const valueSelector = ".rec-tile .v, .stat-tile .v, .big-score";
  const visualSelector =
    ".rec-bars, .rec-stack, .rec-chart, .rec-heat, .slot-strip, .quiz-progress-bar-fill";
  const selector = cardSelector + ", " + valueSelector + ", " + visualSelector;
  const timing = { fast: 120, component: 220, page: 260, emphasis: 420 };
  const easing = "cubic-bezier(.2,.75,.25,1)";
  let reduced = preference.matches;
  let queued = false;
  let paused = false;
  const pending = new Set();
  function visible(node) {
    if (!node?.isConnected || !node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth
    );
  }
  function animate(node, frames, options = {}) {
    if (!node || reduced || !node.animate || document.hidden) return null;
    try {
      const animation = node.animate(frames, {
        duration: timing.component,
        easing,
        ...options,
      });
      active.add(animation);
      animation.finished.then(
        () => active.delete(animation),
        () => active.delete(animation),
      );
      return animation;
    } catch (_) {
      return null;
    }
  }
  function enter(node, options = {}) {
    if (!visible(node)) return;
    // A section can contain position:fixed controls. Its transform must stay untouched.
    const page = options.page || node.classList.contains("section");
    return animate(
      node,
      page
        ? [{ opacity: 0.45 }, { opacity: 1 }]
        : [
            { opacity: 0.3, transform: "translateY(6px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      {
        duration: page ? timing.page : timing.component,
        delay: Math.min(options.delay || 0, 90),
      },
    );
  }
  function pulse(node) {
    return animate(
      node,
      [
        { transform: "scale(1)" },
        { transform: "scale(1.16)", offset: 0.42 },
        { transform: "scale(1)" },
      ],
      { duration: timing.emphasis, easing: "cubic-bezier(.22,1.1,.4,1)" },
    );
  }
  function count(node) {
    if (reduced) return;
    const textNode = Array.from(node.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    if (!textNode) return;
    const text = textNode.textContent,
      trimmed = text.trim();
    const match = trimmed.match(/^(\d[\d,]*)(\.\d+)?(%?)$/);
    if (!match) return;
    const target = Number((match[1] + (match[2] || "")).replace(/,/g, ""));
    if (!Number.isFinite(target)) return;
    const card = node.closest(".rec-tile, .stat-tile, .score-card");
    const label =
      card?.querySelector(".l, .score-label")?.textContent || node.className;
    const key = (node.closest(".section")?.id || "") + "/" + label;
    const from = values.get(key) || 0;
    values.set(key, target);
    if (from === target || !visible(node)) return;
    const decimals = match[2] ? match[2].length - 1 : 0;
    const suffix = match[3];
    const grouped = match[1].includes(",");
    const format = (value) => {
      const rounded = decimals
        ? value.toFixed(decimals)
        : String(Math.round(value));
      return (
        (grouped
          ? Number(rounded).toLocaleString("en-US", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : rounded) + suffix
      );
    };
    // The original final number remains in the accessibility tree and reserves its width.
    // Only an aria-hidden overlay changes during counting; no learning state is touched.
    const wrap = document.createElement("span");
    wrap.className = "ux-number";
    const final = document.createElement("span");
    final.className = "ux-number-final";
    final.textContent = text;
    const overlay = document.createElement("span");
    overlay.className = "ux-number-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const display = document.createTextNode(format(from));
    overlay.appendChild(display);
    wrap.append(final, overlay);
    textNode.replaceWith(wrap);
    const start = performance.now();
    let frame;
    const finish = () => {
      cancelAnimationFrame(frame);
      if (wrap.parentNode) wrap.replaceWith(document.createTextNode(text));
      counts.delete(finish);
    };
    counts.add(finish);
    function tick(now) {
      if (reduced || !node.isConnected || document.hidden) {
        finish();
        return;
      }
      const progress = Math.min(1, (now - start) / timing.emphasis);
      display.nodeValue = format(
        from + (target - from) * (1 - Math.pow(1 - progress, 3)),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
      else finish();
    }
    frame = requestAnimationFrame(tick);
  }
  function visuals(node) {
    if (node.matches(".rec-bars")) {
      Array.from(node.querySelectorAll("i"))
        .slice(0, 7)
        .forEach((bar, i) =>
          animate(
            bar,
            [
              { transform: "scaleY(.08)", opacity: 0.3 },
              { transform: "scaleY(1)", opacity: 1 },
            ],
            { duration: timing.emphasis, delay: i * 12, composite: "replace" },
          ),
        );
      node.querySelectorAll("i").forEach((bar) => {
        bar.style.transformOrigin = "50% 100%";
      });
    } else if (node.matches(".rec-stack, .quiz-progress-bar-fill")) {
      const bars = node.matches(".rec-stack")
        ? node.querySelectorAll("i")
        : [node];
      Array.from(bars)
        .slice(0, 5)
        .forEach((bar, i) => {
          bar.style.transformOrigin = "0% 50%";
          animate(
            bar,
            [
              { transform: "scaleX(.08)", opacity: 0.35 },
              { transform: "scaleX(1)", opacity: 1 },
            ],
            { duration: timing.emphasis, delay: i * 15 },
          );
        });
    } else if (node.matches(".rec-chart")) {
      Array.from(node.querySelectorAll("rect:not([data-rec-day])"))
        .slice(0, 90)
        .forEach((bar, i) =>
          animate(
            bar,
            [
              { transform: "scaleY(.05)", opacity: 0.3 },
              { transform: "scaleY(1)", opacity: 1 },
            ],
            { duration: timing.emphasis, delay: Math.min(i * 5, 90) },
          ),
        );
      const line = node.querySelector("polyline");
      if (line && line.getTotalLength) {
        const length = line.getTotalLength();
        animate(
          line,
          [
            {
              strokeDasharray: `${length} ${length}`,
              strokeDashoffset: String(length),
            },
            { strokeDasharray: `${length} ${length}`, strokeDashoffset: "0" },
          ],
          { duration: timing.emphasis + 100 },
        );
      }
    } else {
      // Calendars can have 182 cells; reveal the group, not hundreds of animations.
      enter(node);
    }
  }
  function reveal(node, index = 0) {
    if (!node.isConnected || !visible(node)) return;
    if (node.matches(valueSelector)) count(node);
    else if (node.matches(visualSelector)) visuals(node);
    else enter(node, { delay: Math.min(index * 12, 60) });
  }
  const intersection =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry, index) => {
              if (!entry.isIntersecting) return;
              intersection.unobserve(entry.target);
              reveal(entry.target, index);
            });
          },
          { threshold: 0.08 },
        )
      : null;
  function consider(node) {
    if (seen.has(node)) return;
    seen.add(node);
    if (reduced) return;
    if (intersection) intersection.observe(node);
    else if (visible(node)) reveal(node);
  }
  function refresh(root = document.getElementById("content")) {
    if (!root?.querySelectorAll) return;
    if (root.matches?.(selector)) consider(root);
    // These selectors intentionally exclude word list rows and calendar cells.
    root.querySelectorAll(selector).forEach(consider);
  }
  const observer = new MutationObserver((records) => {
    if (paused) return;
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (
          node.nodeType !== Node.ELEMENT_NODE ||
          node.matches(".ux-number, .ux-number-overlay, .ux-number-final")
        )
          return;
        // No scans for text-only rows, icons, or the 2,300 vocabulary records.
        if (node.matches(selector) || node.querySelector(selector))
          pending.add(node);
      });
      record.removedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE || !intersection) return;
        if (node.matches(selector)) intersection.unobserve(node);
        node
          .querySelectorAll(selector)
          .forEach((n) => intersection.unobserve(n));
      });
    });
    if (!pending.size || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const roots = Array.from(pending);
      pending.clear();
      roots.forEach(refresh);
    });
  });
  const root = document.getElementById("content");
  if (root) observer.observe(root, { childList: true, subtree: true });
  document.documentElement.classList.add("ux-motion-ready");
  refresh();
  function stop() {
    active.forEach((a) => a.cancel());
    active.clear();
    Array.from(counts).forEach((finish) => finish());
  }
  function preferenceChanged() {
    reduced = preference.matches;
    if (reduced) {
      stop();
      intersection?.disconnect();
    }
  }
  if (preference.addEventListener)
    preference.addEventListener("change", preferenceChanged);
  else preference.addListener(preferenceChanged);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  window.LEAPMotion = {
    enter,
    pulse,
    refresh,
    animate,
    get reduced() {
      return reduced;
    },
    timing,
    easing,
    stop,
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      refresh();
    },
  };
})();
