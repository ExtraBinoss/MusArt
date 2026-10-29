# Security policy

## Report a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/ExtraBinoss/MusArt/security/advisories/new) to contact the maintainer, `@ExtraBinoss`. Do not disclose an unfixed vulnerability or private project data in a public issue or pull request.

Include a minimal reproduction, the affected commit or version, expected and observed behavior, and the possible impact. For browser issues, include the browser version and operating system. Use synthetic artwork and remove credentials or personal data from attachments.

## Supported versions

Security fixes target the current `main` branch and the latest release. Older releases do not have a separate maintenance branch.

## Project data

MusArt stores projects and fonts in the browser. A downloaded `.musart` project contains its original images, so treat it as an artwork file when sharing it. Google Fonts and the optional selection model require resource downloads; image processing runs locally.

## Repository and deployment

Contributions go through pull requests and the project's quality checks. `@ExtraBinoss` owns review and publication. The GitHub Pages workflow restricts deployment to the owner's runs on `main`, with approval through the `github-pages` environment. Workflow files define these checks; GitHub repository settings enforce branch and environment protections.
