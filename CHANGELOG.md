# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 4.0.20

[Beta] Enable pushing code/markdown cell updates to teammates within a group

<!-- <END NEW CHANGELOG ENTRY> -->

## 4.0.19

[Beta] Enable pushing updates to teammates within a group

## 4.0.18

[Alpha] Enable pushing updates to teammates within a group

## 4.0.17

Adding a real-time sync functionality that allows students to receive notebook and cell-level updates pushed by the teacher.

## 4.0.16

No merged PRs

## 4.0.15

No merged PRs

## 4.0.14

Removing salt hashing in server extension

## 4.0.13

- Switching to socketio protocol to establish websocket connections with the backend.
- Encoding the backend URL as a setting and adding a checkbox to switch to local backend routing.

## 4.0.12

No merged PRs

## 4.0.11

Identical to 4.0.9 but solving npm release workflow problem

## 4.0.10

No merged PRs

## 4.0.9

- Adding server extension component
- Generating or retrieving persistent user identifier
- Small bug fixes

## 4.0.8

Removing redundant encryption

## 4.0.7

Changes since last release:

- Major refactor using PanelManager.
- Disabling sending of data when user is also using the dashboard extension and is authorized to view that notebook's dashboard.

## 4.0.6

No merged PRs

## 4.0.5

Changing package name

## 4.0.4

No merged PRs

## 4.0.3

Major changes :

- Websocket connection with the backend to prepare for the chat interface
- PanelManager to manage the websocket, the current panel and the panel tag check
- Adding user consent and extension defaults to opt-in
- Common setting to disable all data collection
- Adding CompatibilityManager to handle the API breaking changes and the backward compatibility of the extension

## 4.0.2

Fixing no OFF cell click event sent when a notebook panel is closed.

## 4.0.1

First release through the releaser. The package should work for JupyterLab >= 3.1 and \< 5. The extension was seeded with a template for JupyterLab 4.x.

New features :

- Including markdown executions to the dashboard using JupyterLab API
- Clicking on the TOC dashboard tile opens the corresponding cell dashboard
- Time filter is shared between both dashboard
- Refresh is shared between both dashboard
- Re-rendering is made smoother by not reloading the charts completely

## 4.0.0

Release of a package that should work for JupyterLab >= 3.1 and \< 5. The extension was seeded with a template for JupyterLab 4.x.

No merged PRs
