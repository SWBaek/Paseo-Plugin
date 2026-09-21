# Configuration

No plugin requires a custom host settings file. This guide describes current 0.9 source; for the published 0.8 release use [v0.1.0-rc.3](https://github.com/NaruForge/Paseo-Plugin/tree/v0.1.0-rc.3/plugins) and for 0.7 use [v0.1.0-rc.2](https://github.com/NaruForge/Paseo-Plugin/tree/v0.1.0-rc.2/plugins).

- Branch Garden reads the selected daemon's Paseo project/workspace registry and uses its installed Git executable. See the [plugin guide](../plugins/branch-garden/README.md).
- Provider Usage reads enabled connections and usage through Paseo. The daemon owns authentication and provider HTTP; the plugin neither reads nor writes credentials. See the [plugin guide](../plugins/provider-usage/README.md).
- Command Deck stores Project-specific PowerShell commands in Host Settings and runs them through the official Terminal SDK on Windows. See the [plugin guide](../plugins/command-deck/README.md).
- Prompt Palette stores its prompt library in built-in Host Settings and sends selected text to the current Agent. See the [plugin guide](../plugins/prompt-palette/README.md).

Settings and credentials belong to the selected daemon host, not the viewing client. Keep authentication files out of Git and issue reports.

The earlier GitHub owner and File Browser root configuration files are no longer consumed by this collection. See [removed plugins](REMOVED_PLUGINS.md) for uninstall and optional leftover cleanup.

## Provider Usage Settings

Changes save immediately. Defaults: Composer pill on, Show remaining % on, Show provider name on, Show reset time off, Reset time display format Date and time. Command Center always provides the usage surface and settings screen. Local Composer pill visibility changes apply after saving; another client’s Composer pill visibility changes converge within 30 seconds while connected. Pill fields use live host settings. Failed saves preserve prior values and offer reload; invalid documents offer explicit default recovery.

Sidebar visibility belongs to **Paseo Settings → Layout**. Provider Usage always registers the Usage sidebar item, independently of its settings state. Schema v3 migrates v1/v2 by removing the retired Sidebar preference, preserving all four choices and defaulting the new reset format to Date and time; it does not modify Paseo Layout. Downgrading to the old schema can report the v3 document as invalid.

**Reset time → Display format** chooses Date and time or Time remaining for both Usage and the pill. Show reset time still independently controls pill visibility. Pill text omits Reset/Resets and uses at most two duration units (`2h 15m`, `6d 3h`). Client-only countdowns update every 30 seconds while mounted; `<1m` covers the final minute and `Due` indicates a passed deadline pending fresh usage. Background throttling may delay the next tick.

## Prompt Palette Settings

Open Settings → Plugins → Prompt Palette. Add a name, optional description and prompt body; Apply to draft, then Save changes. Reorder with Move up/down. Delete requires confirmation and affects stored values only after saving. Cancel / load latest explicitly discards the draft. Leaving Settings or changing Host discards unsaved edits; save first.

The library defaults to empty. Limits: 100 prompts; name 80, description 240 and body 20,000 JavaScript string code units each. Body whitespace is preserved. Simultaneous edits use revision conflict detection: the old draft remains available to copy, and cannot silently overwrite a newer revision.

The Composer Prompts pill opens the latest saved library. Select a prompt, review its full body and target Agent, then Send. The original Composer draft and attachments stay in place. Failed/uncertain delivery keeps the preview and requires checking the conversation before another send. The plugin never automatically retries. A running Agent receives messages according to Paseo/Provider behavior; the plugin does not stop a turn. See the [plugin guide](../plugins/prompt-palette/README.md).

## Command Deck Settings

Select a Project in Settings → Plugins → Command Deck. Add a name, one PowerShell command line and an optional working directory; Apply to draft, then Save changes. Commands are keyed by Project ID and shared across its Workspaces and Git worktrees. Each run uses the current Workspace directory and has separate terminal ownership. Limits: 100 commands across the installation; name 80, command 8,000 and directory 2,000 JavaScript string code units. Stale drafts cannot overwrite newer revisions; Copy draft and Load latest provide explicit recovery.

The installation identifier is retained even when the command list is empty so existing terminals remain discoverable. Removing/reinstalling the plugin deletes that identifier and saved commands; terminals are not automatically killed and the new installation will not adopt them. Stop or inspect them in the Workspace terminal before removal. Never put secrets in commands or settings.

## Paseo 0.9 settings contract

All four plugin sources and v0.1.0-rc.4 target 0.9.0-beta.2. Upgrade daemon, app and CLI from 0.8.0 before installing; `^0.8.0` manifests are rejected. Provider Usage registers **Provider Usage Settings** under Settings → Plugins, using `addSettingsScreen` and host-scoped `defineSettings` → `registerSettings` → `useSettings`; see the [settings reference](plugin-capabilities/backend-and-sdk.md#host-단위-설정-저장) and [0.9 migration plan](MIGRATION_0.9.md).

Built-in values are shared by authorized clients of the same host and installation, validated against a schema, and saved with revision conflict detection. They survive reload/disable/update and daemon restart, but **removing the installation deletes its values**. Reinstalling starts from defaults. They are ordinary JSON, not a credential vault, and provide neither per-user storage nor cross-host synchronization. A settings screen does not replace Paseo's native provider usage screen or expose a generic route into it.

## Update and remove

First run `paseo plugin ls` on the intended Host and note the actual runtime ID and source. Follow the plugin-specific [Branch Garden](../plugins/branch-garden/README.md#update-and-remove), [Provider Usage](../plugins/provider-usage/README.md#update-and-remove), [Prompt Palette](../plugins/prompt-palette/README.md#update-and-remove) or [Command Deck](../plugins/command-deck/README.md#update-and-remove) instructions. Git branch updates and directory reloads preserve settings; removal/reinstallation does not. Copy Prompt Palette prompts, record Provider Usage preferences and copy Command Deck commands before removing those installations. Command Deck also deletes its installation identifier; existing terminals are not killed and are not adopted after reinstall. See [Git rollback details](GIT_INSTALLATION.md#제거와-정리).

Existing version 1 settings preserve command and installation IDs during migration. Known Workspace-to-Project links are resolved in the client; Save changes persists those links with revision protection. Unresolved commands remain under **Needs Project assignment** for manual selection. No commands or terminals are deleted by migration.
