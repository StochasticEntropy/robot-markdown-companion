# Robot Companion - Internal Notes

This file is for development and publishing workflow notes.
It is not included in the VSIX package because `package.json` uses a `files` whitelist that does not include this file.

## Internal Technical Docs

- Cache behavior and invalidation details:
  - `README.CACHE.INTERNAL.md`

## Development / install from folder

1. Open this extension folder in VS Code:
   - `Toolbox/vscode/robot-companion` (or your local clone path)
2. Press `F5` to launch an Extension Development Host.
3. Open a `.robot` file in the Dev Host and use:
   - `Robot Companion: Focus Return Explorer`
   - `Robot Companion: Open Current Documentation Block`

## Publish

1. Ensure `package.json` contains:
   - `"publisher": "StochasticEntropy"`
2. Login once:
   - `npx @vscode/vsce login StochasticEntropy`
3. Package a VSIX:
   - `npm run package`
4. Publish to Marketplace:
   - `npm run publish`
5. Publish updates:
   - `npm run publish:patch`
