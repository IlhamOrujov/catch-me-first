// ============================================================================
//  CATCH ME FIRST — hudmenu.js   ("One tidy menu")
//  The HUD grew ~14 icon buttons. This gathers all of them behind a single
//  ☰ menu that opens a clean labelled grid (icon + name), keeping only the
//  essentials in the top bar. A MutationObserver absorbs buttons added later
//  (e.g. the map tool that appears once the apartment finishes loading).
// ============================================================================

export const HudMenu = {
  drawer: null, menuBtn: null, hud: null,
  KEEP: new Set(["⚙️", "🛠️"]),          // settings + admin stay in the bar

  init() {
    this.hud = document.querySelector(".hud-right");
    if (!this.hud) return this;
    const menuBtn = document.createElement("button");
    menuBtn.className = "icon-btn"; menuBtn.id = "hudMenuBtn"; menuBtn.textContent = "☰"; menuBtn.title = "Tools & panels";
    menuBtn._keep = true;
    menuBtn.onclick = (e) => { e.stopPropagation(); this.drawer.classList.toggle("open"); };
    this.menuBtn = menuBtn;

    this.drawer = document.createElement("div"); this.drawer.id = "hudDrawer";
    document.body.append(this.drawer);
    document.addEventListener("click", (e) => {
      if (this.drawer.classList.contains("open") && !this.drawer.contains(e.target) && e.target !== menuBtn) this.drawer.classList.remove("open");
    });

    this.hud.appendChild(menuBtn);
    [...this.hud.querySelectorAll(".icon-btn")].forEach((b) => this._absorb(b));
    new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList?.contains("icon-btn")) this._absorb(n); }).observe(this.hud, { childList: true });
    return this;
  },

  _absorb(b) {
    if (!b || b === this.menuBtn || b._keep || b._absorbed || this.KEEP.has((b.textContent || "").trim())) return;
    b._absorbed = true;
    const ico = (b.textContent || "").trim();
    const label = (b.title || "").split("—")[0].trim() || ico;   // split on em-dash only (keep "Long-term")
    const item = document.createElement("button");
    item.className = "tool";
    item.innerHTML = `<span class="tool-ico"></span><span class="tool-lbl"></span>`;
    item.querySelector(".tool-ico").textContent = ico;
    item.querySelector(".tool-lbl").textContent = label;
    item.onclick = () => { b.click(); this.drawer.classList.remove("open"); };
    this.drawer.append(item);
    b.style.display = "none";
  },
};
