// Run with Node + Playwright. No external services or real credentials are used.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const base = process.env.LEAP_BASE_URL || "http://127.0.0.1:8080";
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [390, 1280]) {
      const c = await b.newContext({
        viewport: { width, height: 844 },
        hasTouch: true,
        reducedMotion: "reduce",
      });
      const p = await c.newPage();
      p.setDefaultTimeout(7000);
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base);
      await p.evaluate(() => showSection("test"));
      if (width === 390) {
        await p.locator("#rbar-test .range-summary").click();
        await p.locator(".ux-dialog").waitFor();
        assert.equal(
          await p.locator(".ux-dialog").evaluate((e) => e.open),
          true,
        );
        assert.equal(
          await p.evaluate(() => document.body.style.overflow),
          "hidden",
        );
        await p.locator(".ux-dialog [name=start]").fill("10");
        await p.locator(".ux-dialog [name=end]").fill("20");
        await p.locator(".ux-dialog [type=submit]").click();
        await p.locator(".ux-dialog").waitFor({ state: "detached" });
        assert.deepEqual(
          await p.evaluate(() => [state.testStart, state.testEnd]),
          [10, 20],
        );
        assert.equal(await p.evaluate(() => document.body.style.overflow), "");
      }
      await p.evaluate(() => showSection("settings"));
      await p.getByRole("button", { name: /新しいセーブデータを作る/ }).click();
      await p.locator("#ux-name").fill("UXテスト");
      await p.locator(".ux-dialog [type=submit]").click();
      await p.locator(".ux-dialog").waitFor({ state: "detached" });
      assert.equal(await p.evaluate(() => activeSlotName()), "UXテスト");
      assert.match(
        await p.locator(".ux-toast-host").innerText(),
        /追加しました/,
      );
      await p
        .locator(".slot-card.active")
        .getByRole("button", { name: "名前変更", exact: true })
        .click();
      await p.locator("#ux-name").fill("名前を変更");
      await p.locator(".ux-dialog [type=submit]").click();
      await p.locator(".ux-dialog").waitFor({ state: "detached" });
      assert.equal(await p.evaluate(() => activeSlotName()), "名前を変更");
      await p
        .locator(".slot-card.active")
        .getByRole("button", { name: "削除", exact: true })
        .click();
      await p.getByRole("button", { name: "キャンセル", exact: true }).click();
      await p.locator(".ux-dialog").waitFor({ state: "detached" });
      assert.equal(await p.evaluate(() => slotIndex.order.length), 2);
      // Escape and handle drag both have normal-button alternatives.
      await p.evaluate(() => LEAPUX.filters());
      await p.keyboard.press("Escape");
      await p.locator(".ux-dialog").waitFor({ state: "detached" });
      if (width === 390) {
        await p.evaluate(() => LEAPUX.filters());
        const box = await p.locator(".ux-sheet-handle").boundingBox();
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.down();
        await p.mouse.move(
          box.x + box.width / 2,
          box.y + box.height / 2 + 110,
          { steps: 5 },
        );
        await p.mouse.up();
        await p.locator(".ux-dialog").waitFor({ state: "detached" });
      }
      await p.evaluate(() => showSection("wordlist"));
      if (width === 390) {
        await p.getByRole("button", { name: /絞り込み・並び順/ }).click();
        await p
          .locator(".ux-dialog")
          .getByRole("button", { name: "スター付き", exact: true })
          .click();
        await p.locator(".ux-dialog").waitFor({ state: "detached" });
        assert.equal(await p.evaluate(() => state.listFilter), "marked");
        await p.evaluate(() => setListFilter("all"));
      }
      const search = p.locator("#list-search-input");
      await search.fill("agr");
      await p.locator(".ux-search-option").first().waitFor();
      await search.press("ArrowDown");
      await search.press("Enter");
      assert.equal(await search.inputValue(), "agree");
      assert.equal(await p.evaluate(() => state.listSearch), "agree");
      await search.fill("");
      await search.press("Escape");
      await search.blur();
      async function touch(target, dx, dy = 0, cancel = false) {
        await p
          .locator(target)
          .first()
          .evaluate(
            (el, { dx, dy, cancel }) => {
              const t = (x, y) =>
                new Touch({
                  identifier: 4,
                  target: el,
                  clientX: x,
                  clientY: y,
                });
              el.dispatchEvent(
                new TouchEvent("touchstart", {
                  bubbles: true,
                  touches: [t(130, 250)],
                }),
              );
              el.dispatchEvent(
                new TouchEvent("touchmove", {
                  bubbles: true,
                  cancelable: true,
                  touches: [t(130 + dx, 250 + dy)],
                }),
              );
              el.dispatchEvent(
                new TouchEvent(cancel ? "touchcancel" : "touchend", {
                  bubbles: true,
                  touches: [],
                  changedTouches: [t(130 + dx, 250 + dy)],
                }),
              );
            },
            { dx, dy, cancel },
          );
      }
      if (width === 390) {
        const row = 'tr[data-word-no="1"] .td-meaning';
        await touch(row, 130);
        assert.ok(await p.evaluate(() => markRec[1]));
        await p.getByRole("button", { name: "元に戻す", exact: true }).click();
        assert.equal(await p.evaluate(() => !!markRec[1]), false);
        await touch(row, 10, 100);
        assert.equal(await p.evaluate(() => !!markRec[1]), false);
        await touch(row, 120, 0, true);
        assert.equal(await p.evaluate(() => !!markRec[1]), false);
        await touch(row, 130);
        await p.evaluate(() => {
          touch(1);
          markRec[1] = 987;
          saveStorage();
        });
        await p.getByRole("button", { name: "元に戻す", exact: true }).click();
        assert.equal(await p.evaluate(() => markRec[1]), 987);
      }
      await p.evaluate(() => showSection("record"));
      if (width === 390) {
        await touch("#rec-wrap h2", 0, 150);
        await p.waitForFunction(
          () => document.querySelector(".ux-pull").dataset.state === "done",
        );
        await p.locator(".ux-pull").waitFor({ state: "hidden" });
        await p.evaluate(() => showSection("study"));
        await touch(".word-list-item .w", 0, 150);
        assert.equal(await p.locator(".ux-pull").isVisible(), false);
      }
      // Actual pending asynchronous sync: skeleton retains target dimensions; failures stay failures.
      let release;
      const gate = new Promise((r) => (release = r));
      await p.route("https://api.github.com/**", async (route) => {
        await gate;
        await route.fulfill({
          status: 503,
          body: "{}",
          contentType: "application/json",
        });
      });
      await p.evaluate(() => {
        syncCfg = { repo: "fixture/leap", token: "test-only-not-a-credential" };
        showSection("settings");
        window.pendingRefresh = LEAPUX.refresh();
      });
      await p.locator(".ux-skeleton").first().waitFor();
      assert.ok(await p.locator('[aria-busy="true"]').count());
      release();
      await p.waitForFunction(() => syncState.status === "error");
      assert.equal(await p.evaluate(() => window.pendingRefresh), false);
      assert.equal(await p.locator(".ux-skeleton").count(), 0);
      assert.match(
        await p.locator(".ux-toast-host").innerText(),
        /失敗|同期|HTTP 503/,
      );
      await p.unroute("https://api.github.com/**");
      await p.route("https://api.github.com/**", (route) =>
        route.fulfill({
          status: route.request().method() === "GET" ? 404 : 200,
          body: "{}",
          contentType: "application/json",
        }),
      );
      await p.evaluate(() => {
        clearTimeout(syncTimer);
        window.pendingRefresh = LEAPUX.refresh();
      });
      assert.equal(await p.evaluate(() => window.pendingRefresh), true);
      assert.equal(await p.evaluate(() => syncState.status), "ok");
      assert.equal(await p.locator(".ux-skeleton").count(), 0);
      await p.evaluate(() => {
        clearTimeout(syncTimer);
        syncCfg = null;
        showSection("wordlist");
      });
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await p.evaluate(() => {
        LEAPUX.toast("警告のテスト", "warning");
        LEAPUX.toast("エラーのテスト", "error");
      });
      assert.equal(
        await p
          .locator(".ux-toast-host [data-type=error]")
          .getAttribute("role"),
        "alert",
      );
      assert.ok(await p.locator(".ux-toast-host [data-type=warning]").count());
      // Storage failure must produce an error notification, not a false success.
      await p.evaluate(() => {
        Storage.prototype.setItem = function () {
          throw new DOMException("test quota", "QuotaExceededError");
        };
        toggleMark(2000);
      });
      assert.match(
        await p.locator(".ux-toast-host").innerText(),
        /保存できません/,
      );
      assert.deepEqual(errors, []);
      console.log(
        "PASS " +
          width +
          ": Sheet range/edit/cancel, autocomplete, swipe/Undo, pull guard, async skeleton, sync success/error, storage error, zero page errors",
      );
      await c.close();
    }
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
