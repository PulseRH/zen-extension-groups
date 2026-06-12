// Extension Groups — Sine mod for Zen Browser
//
// Groups the items in the extensions panel (Zen's site data panel, or the
// stock unified extensions panel) under custom headers. Group layout is
// stored in the string pref "extension-groups.groups" as JSON:
//
//   { "Privacy": ["uBlock0@raymondhill.net"], "Dev": ["..."] }
//
// Groups render in the order they appear in that object. Extensions not in
// any group fall under an "Other" section. The panel rebuilds its list every
// time it opens, so grouping is re-applied on each ViewShowing.
//
// Extension items come in two flavors and we must handle both (this mirrors
// gUnifiedExtensions._getExtensionId in browser-addons.js):
//   - <unified-extensions-item> custom elements (default panel list)
//   - <toolbaritem class="unified-extensions-item"> CustomizableUI widgets
//     (extensions placed in the addons area — what Zen's grid uses)
// Both carry the class "unified-extensions-item", and the extension id lives
// on a child toolbarbutton as data-extensionid.

(function () {
  "use strict";

  const PREFS = {
    groups: "extension-groups.groups",
    collapsed: "extension-groups.collapsed",
    showOther: "extension-groups.show-other-header",
    otherLabel: "extension-groups.other-label",
  };

  const HEADER_CLASS = "extension-group-header";
  const ITEM_CLASS = "unified-extensions-item";
  const HIDDEN_ATTR = "extension-groups-collapsed";

  // ---------------------------------------------------------------- prefs --

  function getGroups() {
    try {
      const parsed = JSON.parse(Services.prefs.getStringPref(PREFS.groups, "{}"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const groups = {};
      for (const [name, ids] of Object.entries(parsed)) {
        if (Array.isArray(ids)) {
          groups[name] = ids.filter((id) => typeof id === "string");
        }
      }
      return groups;
    } catch (e) {
      console.warn("extension-groups: could not parse groups pref", e);
      return {};
    }
  }

  function setGroups(groups) {
    Services.prefs.setStringPref(PREFS.groups, JSON.stringify(groups));
  }

  function getCollapsed() {
    try {
      const arr = JSON.parse(Services.prefs.getStringPref(PREFS.collapsed, "[]"));
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  function setCollapsed(set) {
    Services.prefs.setStringPref(PREFS.collapsed, JSON.stringify([...set]));
  }

  // ---------------------------------------------------------------- items --

  function isItem(node) {
    return node.classList?.contains(ITEM_CLASS);
  }

  function itemExtensionId(item) {
    return (
      item.querySelector("toolbarbutton")?.dataset.extensionid ||
      item.getAttribute("extension-id") ||
      null
    );
  }

  function extensionIdFromTrigger(triggerNode) {
    const item = triggerNode?.closest?.("." + ITEM_CLASS);
    return item ? itemExtensionId(item) : null;
  }

  // ------------------------------------------------------------- grouping --

  function getView() {
    return document.getElementById("unified-extensions-view");
  }

  function panelIsOpen() {
    const view = getView();
    return !!view && view.closest("panel")?.state === "open";
  }

  // Containers we have rearranged, with their pre-grouping item order, so
  // cleanup can put things back the way CustomizableUI expects them.
  const groupedContainers = [];

  function clearGrouping(view) {
    for (const header of view.querySelectorAll("." + HEADER_CLASS)) {
      header.remove();
    }
    for (const el of view.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
      el.removeAttribute(HIDDEN_ATTR);
    }
    for (const { container, items } of groupedContainers) {
      for (const item of items) {
        if (item.parentElement === container) {
          container.appendChild(item);
        }
      }
    }
    groupedContainers.length = 0;
  }

  function makeHeader(name, collapsedSet) {
    const header = document.createElement("div");
    header.className = HEADER_CLASS;
    header.setAttribute("role", "heading");
    header.setAttribute("aria-level", "2");

    const label = document.createElement("span");
    label.className = "extension-group-header-label";
    label.textContent = name;
    header.appendChild(label);

    if (collapsedSet.has(name)) {
      header.setAttribute("collapsed-group", "true");
    }

    header.addEventListener("click", () => {
      const collapsed = getCollapsed();
      if (collapsed.has(name)) {
        collapsed.delete(name);
      } else {
        collapsed.add(name);
      }
      setCollapsed(collapsed);
      header.toggleAttribute("collapsed-group");
      updateCollapsedVisibility(header.parentElement);
    });

    return header;
  }

  // Walk a container's children in order: items after a collapsed header are
  // hidden until the next header.
  function updateCollapsedVisibility(container) {
    let hide = false;
    for (const child of container.children) {
      if (child.classList.contains(HEADER_CLASS)) {
        hide = child.hasAttribute("collapsed-group");
      } else if (isItem(child)) {
        child.toggleAttribute(HIDDEN_ATTR, hide);
      }
    }
  }

  function groupContainer(container, groups) {
    const items = [...container.children].filter(isItem);
    if (!items.length) {
      return;
    }

    const byId = new Map();
    for (const item of items) {
      const id = itemExtensionId(item);
      if (id) {
        byId.set(id, item);
      }
    }

    groupedContainers.push({ container, items: items.slice() });

    const collapsedSet = getCollapsed();
    const claimed = new Set();
    let renderedAnyGroup = false;

    // appendChild moves nodes, so appending in final order rearranges the
    // container in place: header, its members, next header, ...
    for (const [name, ids] of Object.entries(groups)) {
      const members = ids
        .map((id) => byId.get(id))
        .filter((item) => item && !claimed.has(item));
      if (!members.length) {
        continue;
      }
      renderedAnyGroup = true;
      container.appendChild(makeHeader(name, collapsedSet));
      for (const member of members) {
        claimed.add(member);
        container.appendChild(member);
      }
    }

    const leftovers = items.filter((item) => !claimed.has(item));
    if (renderedAnyGroup && leftovers.length) {
      if (Services.prefs.getBoolPref(PREFS.showOther, true)) {
        const label =
          Services.prefs.getStringPref(PREFS.otherLabel, "Other") || "Other";
        container.appendChild(makeHeader(label, collapsedSet));
      }
      for (const item of leftovers) {
        container.appendChild(item);
      }
    }

    updateCollapsedVisibility(container);
  }

  let applyToken = 0;

  async function applyGrouping(view) {
    const token = ++applyToken;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // The default list populates asynchronously after ViewShowing; CUI-area
    // items exist immediately. Wait for any item, then a beat for the rest.
    for (let i = 0; i < 40 && !view.querySelector("." + ITEM_CLASS); i++) {
      await wait(25);
    }
    await wait(75);
    if (token !== applyToken) {
      return; // a newer apply pass superseded this one
    }

    clearGrouping(view);

    const groups = getGroups();
    if (!Object.keys(groups).length) {
      return;
    }

    // Items can live in several containers (the CUI addons area, the default
    // list, nav-bar overflow). Group within each container independently.
    const containers = new Set(
      [...view.querySelectorAll("." + ITEM_CLASS)].map(
        (item) => item.parentElement
      )
    );
    for (const container of containers) {
      groupContainer(container, groups);
    }
  }

  function reapplyIfOpen() {
    const view = getView();
    if (view && panelIsOpen()) {
      applyGrouping(view).catch(console.error);
    }
  }

  // --------------------------------------------------------- context menu --

  let contextExtensionId = null;

  function moveToGroup(id, name) {
    if (!id) {
      return;
    }
    const groups = getGroups();
    for (const ids of Object.values(groups)) {
      const idx = ids.indexOf(id);
      if (idx !== -1) {
        ids.splice(idx, 1);
      }
    }
    if (name) {
      if (!groups[name]) {
        groups[name] = [];
      }
      groups[name].push(id);
    }
    setGroups(groups);
  }

  function promptForGroupName() {
    const input = { value: "" };
    const ok = Services.prompt.prompt(
      window,
      "New extension group",
      "Group name:",
      input,
      null,
      { value: false }
    );
    const name = ok ? input.value.trim() : "";
    return name || null;
  }

  function populateSubmenu(submenu) {
    while (submenu.firstChild) {
      submenu.firstChild.remove();
    }

    const groups = getGroups();
    const id = contextExtensionId;
    let inAnyGroup = false;

    for (const [name, ids] of Object.entries(groups)) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", name);
      item.setAttribute("type", "checkbox");
      if (ids.includes(id)) {
        item.setAttribute("checked", "true");
        inAnyGroup = true;
      }
      item.addEventListener("command", () => moveToGroup(id, name));
      submenu.appendChild(item);
    }

    if (Object.keys(groups).length) {
      submenu.appendChild(document.createXULElement("menuseparator"));
    }

    const newGroup = document.createXULElement("menuitem");
    newGroup.setAttribute("label", "New group…");
    newGroup.addEventListener("command", () => {
      const name = promptForGroupName();
      if (name) {
        moveToGroup(id, name);
      }
    });
    submenu.appendChild(newGroup);

    if (inAnyGroup) {
      const remove = document.createXULElement("menuitem");
      remove.setAttribute("label", "Remove from group");
      remove.addEventListener("command", () => moveToGroup(id, null));
      submenu.appendChild(remove);
    }
  }

  function ensureContextMenuItem() {
    const contextMenu = document.getElementById("unified-extensions-context-menu");
    if (!contextMenu || contextMenu.querySelector("#extension-groups-move-menu")) {
      return;
    }

    const menu = document.createXULElement("menu");
    menu.id = "extension-groups-move-menu";
    menu.setAttribute("label", "Move to group");

    const submenu = document.createXULElement("menupopup");
    submenu.addEventListener("popupshowing", (event) => {
      if (event.target === submenu) {
        populateSubmenu(submenu);
      }
    });
    menu.appendChild(submenu);

    contextMenu.addEventListener("popupshowing", (event) => {
      if (event.target !== contextMenu) {
        return;
      }
      contextExtensionId = extensionIdFromTrigger(contextMenu.triggerNode);
      menu.hidden = !contextExtensionId;
    });

    contextMenu.appendChild(menu);
  }

  // ----------------------------------------------------------------- init --

  function onViewEvent(event) {
    const view = event.target;
    if (!view || view.id !== "unified-extensions-view") {
      return;
    }
    if (event.type === "ViewShowing") {
      ensureContextMenuItem();
      applyGrouping(view).catch(console.error);
    } else if (event.type === "ViewHiding") {
      // Restore original item order so CustomizableUI's own bookkeeping
      // (Move Up/Down, pinning, new installs) stays consistent.
      clearGrouping(view);
    }
  }

  const prefObserver = () => reapplyIfOpen();

  function init() {
    window.addEventListener("ViewShowing", onViewEvent);
    window.addEventListener("ViewHiding", onViewEvent);
    ensureContextMenuItem();

    // Live-update the open panel when groups change (context menu actions in
    // this or another window, or edits in Sine settings).
    Services.prefs.addObserver(PREFS.groups, prefObserver);
    window.addEventListener(
      "unload",
      () => Services.prefs.removeObserver(PREFS.groups, prefObserver),
      { once: true }
    );
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    window.addEventListener("load", init, { once: true });
  }
})();
