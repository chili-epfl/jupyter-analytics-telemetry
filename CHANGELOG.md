# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 5.0.1

([Full Changelog](https://github.com/chili-epfl/jupyter-analytics-telemetry/compare/v5.0.0...b9c57d934fe729c0539377d7a3a3995330ae585b))

### Merged PRs

- Bug Fixes & Code Refactorization [#5](https://github.com/chili-epfl/jupyter-analytics-telemetry/pull/5) ([@Harkeerat2002](https://github.com/Harkeerat2002), [@zy-cai](https://github.com/zy-cai))

### Contributors to this release

The following people contributed discussions, new ideas, code and documentation contributions, and review.
See [our definition of contributors](https://github-activity.readthedocs.io/en/latest/use/#how-does-this-tool-define-contributions-in-the-reports).

([GitHub contributors page for this release](https://github.com/chili-epfl/jupyter-analytics-telemetry/graphs/contributors?from=2026-02-05&to=2026-02-15&type=c))

@Harkeerat2002 ([activity](https://github.com/search?q=repo%3Achili-epfl%2Fjupyter-analytics-telemetry+involves%3AHarkeerat2002+updated%3A2026-02-05..2026-02-15&type=Issues)) | @zy-cai ([activity](https://github.com/search?q=repo%3Achili-epfl%2Fjupyter-analytics-telemetry+involves%3Azy-cai+updated%3A2026-02-05..2026-02-15&type=Issues))

<!-- <END NEW CHANGELOG ENTRY> -->

## 5.0.0

([Full Changelog](https://github.com/chili-epfl/jupyter-analytics-telemetry/compare/v4.0.20...9fa74201c369af7ca6026eb58a315d56801c1472))

### Merged PRs

- Add features to enhance the code sharing feature [#3](https://github.com/chili-epfl/jupyter-analytics-telemetry/pull/3) ([@Harkeerat2002](https://github.com/Harkeerat2002), [@zy-cai](https://github.com/zy-cai))

### Contributors to this release

The following people contributed discussions, new ideas, code and documentation contributions, and review.
See [our definition of contributors](https://github-activity.readthedocs.io/en/latest/use/#how-does-this-tool-define-contributions-in-the-reports).

([GitHub contributors page for this release](https://github.com/chili-epfl/jupyter-analytics-telemetry/graphs/contributors?from=2025-05-26&to=2026-02-05&type=c))

@Harkeerat2002 ([activity](https://github.com/search?q=repo%3Achili-epfl%2Fjupyter-analytics-telemetry+involves%3AHarkeerat2002+updated%3A2025-05-26..2026-02-05&type=Issues)) | @zy-cai ([activity](https://github.com/search?q=repo%3Achili-epfl%2Fjupyter-analytics-telemetry+involves%3Azy-cai+updated%3A2025-05-26..2026-02-05&type=Issues))

## 4.0.20

[Beta] Enable pushing code/markdown cell updates to teammates within a group

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
