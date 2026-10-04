# 0.0.4

- Fixed the Benchmark FPS Monitor charting a framerate that bounced between two values (e.g. 75 and 37) while the game actually ran at a steady rate. It happened whenever the FPS cap didn't evenly divide the monitor's refresh rate, such as a 60 FPS cap on a 75 Hz screen. Each point is now the number of frames actually drawn in that second ([#1](https://github.com/brunocalado/performance-optimizer/issues/1)).
- Fixed the "No FPS data yet" message staying on top of the chart after data arrived.
- Fixed the chart drawing a line across periods with no data (for example, while someone was on another scene); the line now breaks and resumes.
- Added a **Choose Profile** button to the module settings, available to every user, that reopens the profile chooser shown on first login.
- Removed the automatic low-FPS detection, its mid-session recommendation popup, and the "Automatic FPS Detection" and "Mute FPS Recommendations" settings. Your profile now changes only when you or the GM change it.
- New versions are now published as GitHub releases; the manifest URL changed, and existing installs pick up the new one automatically on update.

# 0.0.3

- Fixed a false "low FPS" profile-downgrade suggestion triggered while the browser window was unfocused (e.g. the user switched to another OS-level app) — the FPS monitor now skips sampling when the window lacks focus, in addition to the existing check for hidden tabs.

# 0.0.2

- Redesigned the profile selection dialog with icon-led cards, a title next to each icon, and a colored tagline (Minimal Visuals / Balanced Quality / Maximum Fidelity) for each profile.
- Renamed the card copy to friendlier titles ("Older Computers", "Average Computers", "Modern Computers") with clearer descriptions of what each profile changes.
- Color-coded each profile tier (red/amber/green) with a subtle resting tint and a matching, softer hover state, reusing the same palette as the Profile Defaults editor.
- Removed the redundant "Current"/"Recommended" badges from the cards, since that information is already shown elsewhere in the dialog.
- Widened the dialog window so the three profile cards lay out clearly side by side.
