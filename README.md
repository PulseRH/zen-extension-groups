# Extension Groups

A [Sine](https://github.com/CosmoCreeper/Sine) mod for [Zen Browser](https://zen-browser.app/) that organizes the extensions panel (the puzzle-piece menu) with **custom headers** and lets you **rearrange extensions into groups** under them.

## Features

- **Custom group headers** in the extensions panel, in any order you want.
- **Right-click to organize** — right-click any extension in the panel (or open its `···` menu) and pick **Move to group**. Create new groups on the fly with **New group…**.
- **Collapsible groups** — click a header to collapse or expand its section. Collapse state is remembered.
- **"Other" section** — extensions you haven't grouped yet are gathered under a configurable header (can be turned off in settings).
- **Grid-mod friendly** — headers span the full row even if another mod turns the panel into an icon grid.

## Install

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. In Zen settings → **Sine Mods**, paste this repository's link into the install field and install.
3. Restart the browser when Sine prompts (JS mods load at startup).

## Usage

1. Open the extensions panel (puzzle-piece button).
2. Right-click an extension → **Move to group** → pick a group or **New group…**.
3. Click any header to collapse/expand that group.

Groups appear in the panel in the order they were created. Extensions in no group sit under the **Other** header at the bottom.

### Settings

Open the mod's preferences in Sine to:

- Toggle/rename the **Other** header.
- Edit the raw group layout. It's stored as JSON in the pref `extension-groups.groups`:

```json
{
  "Privacy": ["uBlock0@raymondhill.net", "{446900e4-71c2-419f-a6a7-df9c091e268b}"],
  "Dev": ["{e6a4a73f-...}"]
}
```

Reordering the keys reorders the groups; reordering IDs inside an array reorders extensions within a group. You can find an extension's ID at `about:debugging#/runtime/this-firefox`.

## How it works

The unified extensions panel rebuilds its contents every time it opens, so the script re-applies grouping on each `ViewShowing` event: it reads the group config from the pref, injects header elements, and moves the matching `unified-extensions-item` nodes under them. No extension data is touched — only the panel's DOM.

## Files

| File | Purpose |
| --- | --- |
| `theme.json` | Sine mod manifest |
| `preferences.json` | Settings shown in Sine's mod UI |
| `extension-groups.uc.js` | Grouping logic, context menu, collapse handling |
| `chrome.css` | Header styling |
