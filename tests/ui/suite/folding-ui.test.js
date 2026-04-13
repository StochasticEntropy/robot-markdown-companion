const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

const EXTENSION_ID = "StochasticEntropy.robot-markdown-companion";
const FIXTURE_SCENARIOS = [
  {
    fixtureName: "folding-regression.robot",
    label: "testcase owner",
    ownerLine: 1,
    headlineRanges: [
      { start: 3, end: 9 },
      { start: 10, end: 13 }
    ],
    headlineMarkerLine: 2,
    headlineNextVisibleLine: 9,
    firstLevelRanges: [
      { start: 4, end: 7 },
      { start: 8, end: 9 },
      { start: 11, end: 13 }
    ],
    firstLevelMarkerLine: 3,
    firstLevelNextVisibleLine: 7,
    secondLevelRanges: [{ start: 6, end: 7 }],
    secondLevelMarkerLine: 5,
    secondLevelNextVisibleLine: 7
  },
  {
    fixtureName: "folding-regression-keywords.robot",
    label: "keyword owner",
    ownerLine: 1,
    headlineRanges: [
      { start: 3, end: 9 },
      { start: 10, end: 13 }
    ],
    headlineMarkerLine: 2,
    headlineNextVisibleLine: 9,
    firstLevelRanges: [
      { start: 4, end: 7 },
      { start: 8, end: 9 },
      { start: 11, end: 13 }
    ],
    firstLevelMarkerLine: 3,
    firstLevelNextVisibleLine: 7,
    secondLevelRanges: [{ start: 6, end: 7 }],
    secondLevelMarkerLine: 5,
    secondLevelNextVisibleLine: 7
  },
  {
    fixtureName: "LeistungEinweisungTRB.robot",
    label: "large testcase owner",
    ownerLine: 10,
    headlineRanges: [
      { start: 28, end: 29 },
      { start: 30, end: 41 },
      { start: 42, end: 74 },
      { start: 75, end: 160 }
    ],
    headlineMarkerLine: 27,
    headlineNextVisibleLine: 29,
    firstLevelRanges: [
      { start: 31, end: 33 },
      { start: 34, end: 40 },
      { start: 43, end: 57 },
      { start: 59, end: 73 },
      { start: 80, end: 97 },
      { start: 98, end: 138 },
      { start: 139, end: 160 }
    ],
    firstLevelMarkerLine: 30,
    firstLevelNextVisibleLine: 33,
    secondLevelRanges: [
      { start: 85, end: 96 },
      { start: 140, end: 159 }
    ],
    secondLevelMarkerLine: 84,
    secondLevelNextVisibleLine: 96
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, description, timeoutMs = 8000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let lastError = undefined;

  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

function normalizeFoldingRanges(ranges) {
  return (Array.isArray(ranges) ? ranges : []).map((range) => ({
    start: Number(range?.start) || 0,
    end: Number(range?.end) || 0
  }));
}

async function getFoldingRanges(document) {
  const ranges = await vscode.commands.executeCommand("_executeFoldingRangeProvider", document.uri);
  return normalizeFoldingRanges(ranges);
}

async function waitForFoldingRanges(document, expectedRanges, label) {
  const expectedSerialized = JSON.stringify(expectedRanges);
  let lastRanges = [];
  try {
    await waitFor(async () => {
      lastRanges = await getFoldingRanges(document);
      return JSON.stringify(lastRanges) === expectedSerialized;
    }, label);
  } catch (error) {
    const detail = `Expected ${expectedSerialized}, last actual ${JSON.stringify(lastRanges)}.`;
    throw new Error(`${error.message} ${detail}`);
  }
}

async function setCursor(editor, line, character = 0) {
  await vscode.window.showTextDocument(editor.document, {
    preview: false,
    preserveFocus: false,
    viewColumn: editor.viewColumn
  });
  await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  const position = new vscode.Position(line, character);
  const selection = new vscode.Selection(position, position);
  editor.selection = selection;
  editor.revealRange(new vscode.Range(position, position));
  await sleep(75);
}

async function waitForCursorDownResult(editor, startLine, expectedLine, label) {
  let lastActualLine = -1;
  try {
    await waitFor(async () => {
      await setCursor(editor, startLine);
      await vscode.commands.executeCommand("cursorDown");
      lastActualLine = editor.selection.active.line;
      return lastActualLine === expectedLine;
    }, label);
  } catch (error) {
    throw new Error(`${error.message} Expected line ${expectedLine}, last actual ${lastActualLine}.`);
  }
}

async function runFoldCommand(command) {
  await vscode.commands.executeCommand("workbench.action.focusSideBar");
  await sleep(100);
  await vscode.commands.executeCommand(command);
}

async function openNonRobotEditor() {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert(extension, `Expected extension ${EXTENSION_ID} to be available in the test host.`);
  const packageDocument = await vscode.workspace.openTextDocument(path.join(extension.extensionPath, "package.json"));
  await vscode.window.showTextDocument(packageDocument, {
    preview: false,
    preserveFocus: false
  });
  await sleep(75);
}

async function runPreviewFoldCommand(command, document) {
  await openNonRobotEditor();
  await vscode.commands.executeCommand("workbench.action.focusSideBar");
  await sleep(100);
  await vscode.commands.executeCommand(command, document.uri.toString());
  await sleep(150);
  return vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false
  });
}

async function createOwnerFold(editor, ownerLine) {
  await setCursor(editor, ownerLine);
  await vscode.commands.executeCommand("editor.fold");
  await sleep(200);
}

suite("Robot Companion documentation folding UI", function () {
  this.timeout(90000);

  const documentsByFixtureName = new Map();
  let editor;

  async function resetEditorState(document) {
    editor = await vscode.window.showTextDocument(document, {
      preview: false
    });
    await vscode.commands.executeCommand("robotCompanion.unfoldDocumentation");
    await vscode.commands.executeCommand("editor.unfoldAll");
    await sleep(250);
  }

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert(extension, `Expected extension ${EXTENSION_ID} to be available in the test host.`);
    await extension.activate();
    await vscode.commands.executeCommand("robotCompanion.useAsDefaultFoldingProvider");

    const fixtureUris = await vscode.workspace.findFiles("*.robot");
    for (const fixtureUri of fixtureUris) {
      documentsByFixtureName.set(path.basename(fixtureUri.fsPath), await vscode.workspace.openTextDocument(fixtureUri));
    }

    for (const scenario of FIXTURE_SCENARIOS) {
      assert(
        documentsByFixtureName.has(scenario.fixtureName),
        `Expected fixture ${scenario.fixtureName} to be present in the workspace.`
      );
    }
  });

  test("stores the workspace override for the Robot Companion folding provider", async () => {
    const override = vscode.workspace.getConfiguration().get("[robotframework]");
    assert.strictEqual(
      override["editor.defaultFoldingRangeProvider"],
      EXTENSION_ID,
      "workspace robotframework override should point at this extension"
    );
    assert.strictEqual(
      override["editor.foldingStrategy"],
      "auto",
      "workspace robotframework override should keep automatic folding"
    );
  });

  for (const scenario of FIXTURE_SCENARIOS) {
    suite(`${scenario.label} fixture`, () => {
      let document;

      setup(async () => {
        document = documentsByFixtureName.get(scenario.fixtureName);
        assert(document, `Expected document for fixture ${scenario.fixtureName}.`);
        await resetEditorState(document);
      });

      test("foldDocumentationToHeadlines exposes only headline ranges and skips nested bodies in the editor", async () => {
        await runFoldCommand("robotCompanion.foldDocumentationToHeadlines");
        await waitForCursorDownResult(
          editor,
          scenario.headlineMarkerLine,
          scenario.headlineNextVisibleLine,
          "headline fold should jump from the first headline to the next headline"
        );
      });

      test("foldDocumentationToHeadlines clears an existing owner fold before applying documentation folds", async () => {
        await createOwnerFold(editor, scenario.ownerLine);
        await runFoldCommand("robotCompanion.foldDocumentationToHeadlines");
        await waitForCursorDownResult(
          editor,
          scenario.ownerLine,
          scenario.ownerLine + 1,
          "owner line should no longer stay collapsed after headline folding"
        );
        await waitForCursorDownResult(
          editor,
          scenario.headlineMarkerLine,
          scenario.headlineNextVisibleLine,
          "headline fold should still land on the next headline after clearing an owner fold"
        );
      });

      test("foldDocumentationToFirstLevel exposes only first-level ranges and keeps the owner visible", async () => {
        await runFoldCommand("robotCompanion.foldDocumentationToFirstLevel");
        await waitForCursorDownResult(
          editor,
          scenario.firstLevelMarkerLine,
          scenario.firstLevelNextVisibleLine,
          "first-level fold should jump from the first top-level marker to the next top-level peer"
        );
      });

      test("foldDocumentationToFirstLevel clears an existing owner fold before applying documentation folds", async () => {
        await createOwnerFold(editor, scenario.ownerLine);
        await runFoldCommand("robotCompanion.foldDocumentationToFirstLevel");
        await waitForCursorDownResult(
          editor,
          scenario.ownerLine,
          scenario.ownerLine + 1,
          "owner line should no longer stay collapsed after first-level folding"
        );
        await waitForCursorDownResult(
          editor,
          scenario.firstLevelMarkerLine,
          scenario.firstLevelNextVisibleLine,
          "first-level fold should still land on the next top-level peer after clearing an owner fold"
        );
      });

      test("foldDocumentationToSecondLevel exposes only nested ranges and skips only the nested body", async () => {
        await runFoldCommand("robotCompanion.foldDocumentationToSecondLevel");
        await waitForCursorDownResult(
          editor,
          scenario.secondLevelMarkerLine,
          scenario.secondLevelNextVisibleLine,
          "second-level fold should jump from the nested marker to the next visible top-level marker"
        );
      });

      test("unfoldDocumentation restores line-by-line cursor movement", async () => {
        await runFoldCommand("robotCompanion.foldDocumentationToHeadlines");

        await runFoldCommand("robotCompanion.unfoldDocumentation");
        await sleep(250);

        await waitForCursorDownResult(
          editor,
          scenario.headlineMarkerLine,
          scenario.headlineMarkerLine + 1,
          "headline marker should move to the next line after unfold"
        );
        await waitForCursorDownResult(
          editor,
          scenario.firstLevelMarkerLine,
          scenario.firstLevelMarkerLine + 1,
          "first-level marker should move to the next line after unfold"
        );
        await waitForCursorDownResult(
          editor,
          scenario.secondLevelMarkerLine,
          scenario.secondLevelMarkerLine + 1,
          "second-level marker should move to the next line after unfold"
        );
      });

      test("preview-targeted folding commands work even when a non-robot editor is active", async () => {
        editor = await runPreviewFoldCommand("robotCompanion.foldDocumentationToHeadlines", document);
        await waitForCursorDownResult(
          editor,
          scenario.headlineMarkerLine,
          scenario.headlineNextVisibleLine,
          "preview headline fold should jump to the next headline"
        );

        editor = await runPreviewFoldCommand("robotCompanion.foldDocumentationToFirstLevel", document);
        await waitForCursorDownResult(
          editor,
          scenario.firstLevelMarkerLine,
          scenario.firstLevelNextVisibleLine,
          "preview first-level fold should jump to the next top-level marker"
        );

        editor = await runPreviewFoldCommand("robotCompanion.foldDocumentationToSecondLevel", document);
        await waitForCursorDownResult(
          editor,
          scenario.secondLevelMarkerLine,
          scenario.secondLevelNextVisibleLine,
          "preview second-level fold should jump over only the nested body"
        );

        editor = await runPreviewFoldCommand("robotCompanion.unfoldDocumentation", document);
        await sleep(250);
        await waitForCursorDownResult(
          editor,
          scenario.headlineMarkerLine,
          scenario.headlineMarkerLine + 1,
          "preview unfold should restore line-by-line movement"
        );
      });
    });
  }
});
