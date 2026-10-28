/* Small interaction layer. Storage schemas and learning decisions remain in index.html. */
(() => {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = (node, frames, duration = 220) =>
    window.LEAPMotion?.animate(node, frames, { duration });
  const host = document.createElement("div");
  host.className = "ux-toast-host";
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-relevant", "additions");
  document.body.append(host);
  let lastError = 0,
    activeSheet = null,
    refreshTask = null,
    syncLoading = null;
  function toast(message, type = "info", options = {}) {
    if (host.children.length >= 2) host.firstElementChild.remove();
    const item = document.createElement("div");
    item.className = "ux-toast";
    item.dataset.type = type;
    if (type === "error") item.setAttribute("role", "alert");
    const glyph = document.createElement("span");
    glyph.className = "ux-toast-icon";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent =
      { success: "✓", info: "i", warning: "!", error: "!" }[type] || "i";
    const text = document.createElement("span");
    text.className = "ux-toast-message";
    text.textContent = message;
    item.append(glyph, text);
    let timer,
      dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      const a = motion(
        item,
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(8px)" },
        ],
        120,
      );
      if (a)
        a.finished.then(
          () => item.remove(),
          () => item.remove(),
        );
      else item.remove();
    };
    if (options.action) {
      const b = document.createElement("button");
      b.textContent = options.actionLabel || "元に戻す";
      b.onclick = () => {
        dismiss();
        options.action();
      };
      item.append(b);
    }
    const close = document.createElement("button");
    close.className = "ux-toast-dismiss";
    close.setAttribute("aria-label", "通知を閉じる");
    close.textContent = "×";
    close.onclick = dismiss;
    item.append(close);
    host.append(item);
    motion(item, [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ]);
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(
        dismiss,
        options.action ? 8500 : type === "error" ? 9000 : 4200,
      );
    };
    item.addEventListener("pointerenter", () => clearTimeout(timer));
    item.addEventListener("pointerleave", schedule);
    item.addEventListener("focusin", () => clearTimeout(timer));
    item.addEventListener("focusout", schedule);
    schedule();
    return item;
  }
  function storageError() {
    if (Date.now() - lastError < 10000) return;
    lastError = Date.now();
    toast(
      "端末に保存できませんでした。設定から記録をエクスポートしてください。",
      "error",
    );
  }
  function sheet(title, content, setup = () => {}) {
    if (activeSheet) activeSheet.close(true);
    const previous = document.activeElement,
      dialog = document.createElement("dialog");
    dialog.className = "ux-dialog";
    dialog.setAttribute("aria-labelledby", "ux-sheet-title");
    dialog.innerHTML =
      '<button type="button" class="ux-sheet-handle" tabindex="-1" aria-label="下へドラッグして閉じる"></button><div class="ux-sheet-head"><h2 id="ux-sheet-title"></h2><button type="button" class="ux-sheet-close" autofocus aria-label="閉じる">×</button></div><div class="ux-sheet-body"></div>';
    dialog.querySelector("h2").textContent = title;
    const body = dialog.querySelector(".ux-sheet-body");
    if (typeof content === "string") body.innerHTML = content;
    else body.append(content);
    let done = false,
      removed = false,
      onClose = () => {},
      oldOverflow = document.body.style.overflow;
    const finish = () => {
      if (removed) return;
      removed = true;
      dialog.close();
      dialog.remove();
      if (activeSheet === api) {
        document.body.style.overflow = oldOverflow;
        activeSheet = null;
      }
      onClose();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else
        document
          .querySelector(".nav-btn.active")
          ?.focus({ preventScroll: true });
    };
    const api = {
      body,
      dialog,
      close(immediate = false) {
        if (done) {
          if (immediate === true) finish();
          return;
        }
        done = true;
        const a =
          immediate === true
            ? null
            : motion(
                dialog,
                [
                  { opacity: 1, transform: "translateY(0)" },
                  {
                    opacity: 0,
                    transform: isMobile()
                      ? "translateY(32px)"
                      : "translateY(6px)",
                  },
                ],
                120,
              );
        if (a) a.finished.then(finish, finish);
        else finish();
      },
      set onClose(fn) {
        onClose = fn;
      },
    };
    activeSheet = api;
    document.body.append(dialog);
    document.body.style.overflow = "hidden";
    dialog.showModal();
    motion(
      dialog,
      isMobile()
        ? [
            { transform: "translateY(70px)", opacity: 0.6 },
            { transform: "translateY(0)", opacity: 1 },
          ]
        : [
            { transform: "translateY(8px) scale(.98)", opacity: 0.3 },
            { transform: "translateY(0) scale(1)", opacity: 1 },
          ],
    );
    dialog.querySelector(".ux-sheet-close").onclick = api.close;
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      api.close();
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          api.close();
      }
    });
    const handle = dialog.querySelector(".ux-sheet-handle");
    let drag = null;
    handle.addEventListener("pointerdown", (e) => {
      if (!isMobile()) return;
      drag = { id: e.pointerId, y: e.clientY };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (drag && drag.id === e.pointerId && !reduced())
        dialog.style.transform = `translateY(${Math.max(0, e.clientY - drag.y)}px)`;
    });
    handle.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      drag = null;
      dialog.style.transform = "";
      if (dy > 75) api.close();
      else
        motion(dialog, [
          { transform: `translateY(${Math.max(0, dy)}px)` },
          { transform: "translateY(0)" },
        ]);
    });
    handle.addEventListener("pointercancel", () => {
      drag = null;
      dialog.style.transform = "";
    });
    setup(api);
    return api;
  }
  function namePrompt(title, value) {
    return new Promise((resolve) => {
      let resolved = false;
      const s = sheet(
        title,
        '<form><label for="ux-name">名前（20文字まで）</label><input id="ux-name" maxlength="20" autocomplete="off" required><div class="ux-sheet-actions"><button type="button" class="btn-secondary" data-cancel>キャンセル</button><button type="submit" class="btn-primary">保存</button></div></form>',
        (s) => {
          const input = s.body.querySelector("input");
          input.value = value;
          s.body.querySelector("[data-cancel]").onclick = s.close;
          s.body.querySelector("form").onsubmit = (e) => {
            e.preventDefault();
            const v = input.value.trim();
            if (!v) {
              input.focus();
              return;
            }
            resolved = true;
            resolve(v.slice(0, 20));
            s.close();
          };
          if (!isMobile()) input.focus();
        },
      );
      s.onClose = () => {
        if (!resolved) resolve(null);
      };
    });
  }
  function confirmAction(title, message) {
    return new Promise((resolve) => {
      let resolved = false;
      const s = sheet(
        title,
        '<p></p><div class="ux-sheet-actions"><button type="button" class="btn-secondary" data-cancel>キャンセル</button><button type="button" class="btn-danger btn-secondary" data-confirm>削除する</button></div>',
        (s) => {
          s.body.querySelector("p").textContent = message;
          s.body.querySelector("[data-cancel]").onclick = s.close;
          s.body.querySelector("[data-confirm]").onclick = () => {
            resolved = true;
            resolve(true);
            s.close();
          };
        },
      );
      s.onClose = () => {
        if (!resolved) resolve(false);
      };
    });
  }
  function openRange(id) {
    const p = RANGE_PAGES.find((x) => x.id === id);
    if (!p) return;
    const [start, end] = p.get();
    sheet(
      "学習する範囲",
      '<form><div class="ux-range-inputs"><label>開始番号<input name="start" type="number" inputmode="numeric" min="1" max="' +
        MAX_NO +
        '" required></label><span>〜</span><label>終了番号<input name="end" type="number" inputmode="numeric" min="1" max="' +
        MAX_NO +
        '" required></label></div><p>範囲を決めたら、すぐに学習を始められます。</p><button type="submit" class="btn-primary">この範囲を使う</button></form>',
      (s) => {
        s.body.querySelector("[name=start]").value = start;
        s.body.querySelector("[name=end]").value = end;
        s.body.querySelector("form").onsubmit = (e) => {
          e.preventDefault();
          const values = normalizeRange(
            s.body.querySelector("[name=start]").value,
            s.body.querySelector("[name=end]").value,
          );
          s.close();
          applyRangePreset(id, ...values);
        };
      },
    );
  }
  function filters() {
    const entries = [
      ["all", "すべて"],
      ["ever", "過去に間違えた"],
      ["review", "要復習"],
      ["recovering", "克服中"],
      ["mastered", "克服済み"],
      ["marked", "スター付き"],
    ];
    sheet("絞り込み・並び順", '<div class="ux-sheet-options"></div>', (s) => {
      const group = s.body.firstElementChild;
      for (const [key, label] of entries) {
        const b = document.createElement("button");
        b.className = "ux-sheet-option";
        b.textContent = label;
        b.setAttribute("aria-pressed", String(state.listFilter === key));
        b.onclick = () => {
          s.close();
          setListFilter(key);
          toast(label + "を表示", "info");
        };
        group.append(b);
      }
      const b = document.createElement("button");
      b.className = "ux-sheet-option";
      b.textContent =
        state.listSort === "miss" ? "番号順に戻す" : "間違えた回数順に並べる";
      b.onclick = () => {
        s.close();
        toggleListSort();
        toast("並び順を変更しました", "info");
      };
      group.append(b);
    });
  }
  function reviewFilters() {
    const labels = {
      review: "要復習",
      recovering: "克服中",
      mastered: "克服済み",
      marked: "スター付き",
    };
    sheet(
      "復習する単語",
      '<p>出題に含める分類を選んでください。複数選択できます。</p><div class="ux-sheet-options"></div><button type="button" class="btn-primary" data-done>この対象で復習する</button>',
      (s) => {
        const group = s.body.querySelector(".ux-sheet-options");
        for (const key of REVIEW_SEL_KEYS) {
          const b = document.createElement("button");
          b.className = "ux-sheet-option";
          b.textContent = labels[key];
          b.setAttribute("aria-pressed", String(reviewSel.has(key)));
          b.onclick = () => {
            toggleReviewSel(key);
            b.setAttribute("aria-pressed", String(reviewSel.has(key)));
          };
          group.append(b);
        }
        s.body.querySelector("[data-done]").onclick = s.close;
      },
    );
  }
  function loading(target, on) {
    if (!target) return;
    const old = target.querySelector(":scope > .ux-skeleton");
    if (!on) {
      target.classList.remove("ux-busy");
      target.removeAttribute("aria-busy");
      old?.remove();
      return;
    }
    if (old) return;
    target.classList.add("ux-busy");
    target.setAttribute("aria-busy", "true");
    const sk = document.createElement("div");
    sk.className = "ux-skeleton";
    sk.setAttribute("aria-hidden", "true");
    const kind =
      target.id === "list-body"
        ? "list"
        : target.matches(".rec-tiles")
          ? "stats"
          : "card";
    sk.dataset.kind = kind;
    if (kind === "stats") {
      sk.innerHTML = Array.from(
        { length: 3 },
        () =>
          '<div class="ux-skeleton-tile"><span class="ux-skeleton-row"></span><span class="ux-skeleton-row"></span></div>',
      ).join("");
    } else if (kind === "list") {
      sk.innerHTML = Array.from(
        { length: 6 },
        () =>
          '<div class="ux-skeleton-item"><span class="ux-skeleton-row"></span><span class="ux-skeleton-row"></span></div>',
      ).join("");
    } else {
      sk.innerHTML =
        '<span class="ux-skeleton-row"></span><span class="ux-skeleton-row"></span><span class="ux-skeleton-row"></span>';
    }
    target.append(sk);
  }
  function syncStatus(status, message) {
    if (status === "syncing") {
      syncLoading = document.getElementById("sync-card");
      loading(syncLoading, true);
    } else {
      loading(syncLoading, false);
      syncLoading = null;
      if (status === "error" && !refreshTask)
        toast(message || "同期できませんでした", "error");
    }
  }
  async function refresh() {
    if (refreshTask) return refreshTask;
    if (activeSheet) return false;
    const section = state.section;
    if (!["record", "wordlist", "settings"].includes(section)) return false;
    refreshTask = (async () => {
      const root = document.getElementById("section-" + section),
        target = root.querySelector(".rec-tiles, .slot-card, #list-body");
      const button = root.querySelector("[data-ux-refresh]");
      try {
        if (button) button.disabled = true;
        if (syncRunning) {
          toast("同期中です。完了後にもう一度更新してください。", "info");
          return false;
        }
        if (syncCfg) {
          loading(target, true);
          await syncNow("all");
          if (syncState.status !== "ok")
            throw new Error(syncState.msg || "同期できませんでした");
        }
        flushTime();
        if (state.section === section) {
          renderSection(section);
          window.LEAPMotion?.enter(root, { page: true });
        }
        toast(
          syncCfg ? "同期して表示を更新しました" : "表示を更新しました",
          "success",
        );
        return true;
      } catch (e) {
        toast(e.message || "更新できませんでした", "error");
        return false;
      } finally {
        loading(target, false);
        if (button?.isConnected) button.disabled = false;
      }
    })();
    try {
      return await refreshTask;
    } finally {
      refreshTask = null;
    }
  }
  function updateList() {
    if (state.section !== "wordlist") return;
    const list = document.querySelector("#list-body .scroll-list"),
      top = list?.scrollTop || 0;
    listSearch(state.listSearch || "");
    const next = document.querySelector("#list-body .scroll-list");
    if (next) next.scrollTop = top;
  }
  function markAction(no, on) {
    const slot = slotIndex.active,
      old = markRec[no];
    if (!!old === on) {
      toast(
        on ? "すでにスターが付いています" : "スターは付いていません",
        "info",
      );
      return;
    }
    const saved = toggleMark(no);
    updateList();
    if (saved === false) return;
    const applied = markRec[no],
      appliedAt = updRec[no];
    toast(on ? "スターを付けました" : "スターを外しました", "success", {
      action() {
        if (slotIndex.active !== slot) {
          toast(
            "操作したセーブデータに戻ってから変更してください。",
            "warning",
          );
          return;
        }
        if (markRec[no] !== applied || updRec[no] !== appliedAt) {
          toast(
            "この単語はその後に変更されたため、元に戻せません。",
            "warning",
          );
          return;
        }
        if (!!markRec[no] !== !!old) toggleMark(no);
        if (old) markRec[no] = old;
        touch(no);
        const saved = saveStorage();
        updateList();
        if (saved) toast("元に戻しました", "info");
      },
    });
  }
  // Word-list swipe acts only on stars; there is always a normal star button too.
  let swipe = null,
    suppressClickUntil = 0;
  const listRoot = document.getElementById("section-wordlist");
  listRoot.addEventListener(
    "touchstart",
    (e) => {
      swipe = null;
      if (
        !isMobile() ||
        activeSheet ||
        e.touches.length !== 1 ||
        e.target.closest("button,input,a")
      )
        return;
      const row = e.target.closest("tr[data-word-no]");
      if (!row) return;
      const p = e.touches[0];
      swipe = {
        row,
        no: Number(row.dataset.wordNo),
        x: p.clientX,
        y: p.clientY,
        drag: false,
      };
    },
    { passive: true },
  );
  listRoot.addEventListener(
    "touchmove",
    (e) => {
      if (!swipe) return;
      if (e.touches.length !== 1) {
        resetSwipe();
        return;
      }
      const p = e.touches[0],
        dx = p.clientX - swipe.x,
        dy = p.clientY - swipe.y;
      if (!swipe.drag) {
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
          resetSwipe();
          return;
        }
        if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4)
          swipe.drag = true;
      }
      if (swipe.drag) {
        if (e.cancelable) e.preventDefault();
        swipe.row.classList.add("ux-swiping");
        if (!reduced())
          swipe.row.style.transform = `translateX(${Math.max(-65, Math.min(65, dx * 0.6))}px)`;
      }
    },
    { passive: false },
  );
  function resetSwipe() {
    if (swipe) {
      swipe.row.style.transform = "";
      swipe.row.classList.remove("ux-swiping");
    }
    swipe = null;
  }
  listRoot.addEventListener("touchcancel", resetSwipe, { passive: true });
  listRoot.addEventListener(
    "touchend",
    (e) => {
      if (!swipe) return;
      const s = swipe,
        p = e.changedTouches[0];
      resetSwipe();
      if (!p || !s.drag || e.touches.length) return;
      const dx = p.clientX - s.x,
        dy = p.clientY - s.y;
      if (Math.abs(dx) < 75 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      suppressClickUntil = Date.now() + 350;
      motion(s.row, [
        { transform: `translateX(${dx > 0 ? 55 : -55}px)` },
        { transform: "translateX(0)" },
      ]);
      markAction(s.no, dx > 0);
    },
    { passive: true },
  );
  listRoot.addEventListener(
    "click",
    (e) => {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  // Pull is limited to the top of read-only views, with no nested scroll or input conflict.
  const pull = document.createElement("div");
  pull.className = "ux-pull";
  pull.hidden = true;
  pull.setAttribute("role", "status");
  pull.innerHTML =
    '<span class="ux-pull-glyph" aria-hidden="true">↓</span><span class="ux-pull-text"></span>';
  document.body.append(pull);
  let gesture = null,
    pullTimer;
  function pullState(status, text, dy = 0) {
    pull.hidden = false;
    pull.dataset.state = status;
    pull.querySelector(".ux-pull-text").textContent = text;
    pull.querySelector(".ux-pull-glyph").textContent =
      status === "loading"
        ? "◌"
        : status === "done"
          ? "✓"
          : status === "error"
            ? "!"
            : "↓";
    pull.style.opacity = "1";
    pull.style.transform = `translate(-50%,${reduced() ? 0 : Math.min(12, dy * 0.15)}px)`;
  }
  function hidePull() {
    gesture = null;
    pull.hidden = true;
    pull.style.opacity = "0";
  }
  const content = document.getElementById("content");
  content.addEventListener(
    "touchstart",
    (e) => {
      if (
        refreshTask ||
        activeSheet ||
        !isMobile() ||
        !["record", "wordlist", "settings"].includes(state.section) ||
        scrollY > 0 ||
        e.touches.length !== 1 ||
        e.target.closest("button,input,textarea,select,a,summary")
      )
        return;
      for (let n = e.target; n && n !== content; n = n.parentElement) {
        if (n.scrollTop > 0) return;
      }
      clearTimeout(pullTimer);
      const p = e.touches[0];
      gesture = {
        x: p.clientX,
        y: p.clientY,
        section: state.section,
        dy: 0,
        drag: false,
      };
    },
    { passive: true },
  );
  content.addEventListener(
    "touchmove",
    (e) => {
      if (!gesture) return;
      if (e.touches.length !== 1 || state.section !== gesture.section) {
        hidePull();
        return;
      }
      const p = e.touches[0],
        dx = p.clientX - gesture.x,
        dy = p.clientY - gesture.y;
      if (!gesture.drag && Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy)) {
        hidePull();
        return;
      }
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
      gesture.drag = true;
      gesture.dy = dy;
      if (e.cancelable) e.preventDefault();
      pullState(
        dy >= 85 ? "armed" : "pulling",
        dy >= 85 ? "離して更新" : "引っぱって更新",
        dy,
      );
    },
    { passive: false },
  );
  content.addEventListener("touchcancel", hidePull, { passive: true });
  content.addEventListener(
    "touchend",
    async () => {
      if (!gesture) return;
      const s = gesture;
      gesture = null;
      if (!s.drag || s.dy < 85) {
        hidePull();
        return;
      }
      pullState("loading", "更新中…");
      const ok = await refresh();
      pullState(
        ok ? "done" : "error",
        ok ? "更新しました" : "更新できませんでした",
      );
      pullTimer = setTimeout(hidePull, 900);
    },
    { passive: true },
  );
  window.LEAPUX = {
    toast,
    storageError,
    sheet,
    namePrompt,
    confirmAction,
    openRange,
    filters,
    reviewFilters,
    loading,
    syncStatus,
    refresh,
    isSheetOpen: () => !!activeSheet,
    closeSheet: () => activeSheet?.close(),
  };
  document.documentElement.classList.add("ux-ready");
})();
