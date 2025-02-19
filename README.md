# Jupyter Analytics Telemetry

[![Binder Badge](https://github.com/chili-epfl/jupyter-analytics-telemetry/actions/workflows/binder-on-pr.yml/badge.svg)](https://github.com/chili-epfl/jupyter-analytics-telemetry/actions/workflows/binder-on-pr.yml)
[![Build](https://github.com/chili-epfl/jupyter-analytics-telemetry/actions/workflows/build.yml/badge.svg)](https://github.com/chili-epfl/jupyter-analytics-telemetry/actions/workflows/build.yml)
[![Check Release](https://github.com/chili-epfl/jupyter-analytics-telemetry/actions/workflows/check-release.yml/badge.svg)](https://github.com/chili-epfl/jupyter-analytics-telemetry/actions/workflows/check-release.yml)

This repository is part of the learning analytics system ([**Jupyter Analytics**](https://github.com/chili-epfl/jupyter-analytics)). It builds a JupyterLab extension that collects user interaction data and sends it to the [**Backend**](https://github.com/chili-epfl/jupyter-analytics-backend), which can be retrieved and visualized by [**Dashboard**](https://github.com/chili-epfl/jupyter-analytics-dashboard).

## Requirements

- JupyterLab >= 3.1.0

## Install

To install the extension, execute:

```bash
pip install jupyterlab-unianalytics-telemetry
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab-unianalytics-telemetry
```

## Troubleshoot

If you are seeing the frontend extension, but it is not working, check
that the server extension is enabled:

```bash
jupyter server extension list
```

If the server extension is installed and enabled, but you are not seeing
the frontend extension, check the frontend extension is installed:

```bash
jupyter labextension list
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlab_unianalytics_telemetry directory
# Install package in development mode
pip install -e ".[test]"
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Server extension must be manually installed in develop mode
jupyter server extension enable jupyterlab_unianalytics_telemetry
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
# Server extension must be manually disabled in develop mode
jupyter server extension disable jupyterlab_unianalytics_telemetry
pip uninstall jupyterlab_unianalytics_telemetry
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `jupyterlab_unianalytics_telemetry` within that folder.

### Testing the extension

#### Server tests

This extension is using [Pytest](https://docs.pytest.org/) for Python code testing.

Install test dependencies (needed only once):

```sh
pip install -e ".[test]"
# Each time you install the Python package, you need to restore the front-end extension link
jupyter labextension develop . --overwrite
```

To execute them, run:

```sh
pytest -vv -r ap --cov jupyterlab_unianalytics_telemetry
```

#### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```sh
jlpm
jlpm test
```

#### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.

More information are provided within the [ui-tests](./ui-tests/README.md) README.

### Packaging the extension

See [RELEASE](RELEASE.md)

## Credits

- [Raphaël Mariétan](https://github.com/Rmarieta) (main developer)
- [Richard Davis](https://github.com/richarddavis) (developer, project manager, researcher)
- [Zhenyu Cai](https://github.com/zy-cai) (developer, researcher)
- [Pierre Dillenbourg](https://scholar.google.com/citations?user=FdvKJcIAAAAJ) (principle investigator, research advisor)
- [Roland Tormey](https://scholar.google.com/citations?user=IHrqibEAAAAJ) (research advisor)

This project is part of the "[Uni Analytics](https://data.snf.ch/grants/grant/187534)" project funded by SNSF (Swiss National Science Foundation). That's why in the source code we put "unianalytics" as the identifier. 😃

## Citation

If you find this repository useful, please cite our paper:

```
Cai, Z., Davis, R., Mariétan, R., Tormey, R., & Dillenbourg, P. (2025).
Jupyter Analytics: A Toolkit for Collecting, Analyzing, and Visualizing Distributed Student Activity in Jupyter Notebooks.
In Proceedings of the 56th ACM Technical Symposium on Computer Science Education (SIGCSE TS 2025).
```

## Copyright

© All rights reserved. ECOLE POLYTECHNIQUE FEDERALE DE LAUSANNE (EPFL), Switzerland, Computer-Human Interaction Lab for Learning & Instruction (CHILI), 2025

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/chili-epfl/jupyter-analytics-telemetry/blob/main/LICENSE) file for details.
