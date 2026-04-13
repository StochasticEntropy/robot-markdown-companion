const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

const EXTENSION_ID = "StochasticEntropy.robot-markdown-companion";
const FIXTURE_SCENARIOS = [
  {
    fixtureName: "folding-regression.robot",
    label: "testcase owner",
    ownerLine: 1,
    expectedBodyRanges: {
      headline: [
        [2, 8],
        [9, 12]
      ],
      firstLevel: [
        [3, 6],
        [7, 8],
        [10, 12]
      ],
      secondLevel: [[5, 6]]
    },
    headlineCursorJumps: [{ from: 2, to: 9 }],
    firstLevelCursorJumps: [{ from: 3, to: 7 }],
    secondLevelCursorJumps: [{ from: 5, to: 7 }]
  },
  {
    fixtureName: "folding-regression-keywords.robot",
    label: "keyword owner",
    ownerLine: 1,
    expectedBodyRanges: {
      headline: [
        [2, 8],
        [9, 12]
      ],
      firstLevel: [
        [3, 6],
        [7, 8],
        [10, 12]
      ],
      secondLevel: [[5, 6]]
    },
    headlineCursorJumps: [{ from: 2, to: 9 }],
    firstLevelCursorJumps: [{ from: 3, to: 7 }],
    secondLevelCursorJumps: [{ from: 5, to: 7 }]
  },
  {
    fixtureName: "folding-regression-large.robot",
    label: "large testcase owner",
    ownerLine: 10,
    expectedBodyRanges: {
      headline: [
        [27, 28],
        [29, 40],
        [41, 73],
        [74, 159]
      ],
      firstLevel: [
        [30, 32],
        [33, 39],
        [42, 56],
        [58, 72],
        [79, 96],
        [97, 137],
        [138, 159]
      ],
      secondLevel: [
        [84, 95],
        [139, 158]
      ]
    },
    headlineCursorJumps: [
      { from: 27, to: 29 },
      { from: 29, to: 41 },
      { from: 41, to: 74 }
    ],
    firstLevelCursorJumps: [
      { from: 29, to: 30 },
      { from: 30, to: 33 },
      { from: 33, to: 41 },
      { from: 41, to: 42 },
      { from: 42, to: 57 },
      { from: 79, to: 97 },
      { from: 97, to: 138 }
    ],
    secondLevelCursorJumps: [{ from: 84, to: 97 }]
  },
  {
    fixtureName: "folding-regression-adjustment.robot",
    label: "large adjustment testcase owner",
    ownerLine: 13,
    expectedBodyRanges: {
      headline: [
        [74, 156],
        [157, 204],
        [205, 266],
        [267, 310],
        [311, 349]
      ],
      firstLevel: [
        [75, 88],
        [89, 132],
        [133, 155],
        [158, 177],
        [178, 184],
        [185, 193],
        [194, 197],
        [198, 203],
        [268, 309],
        [328, 349]
      ],
      secondLevel: [
        [162, 176],
        [186, 192],
        [199, 202],
        [238, 265],
        [333, 348]
      ]
    },
    headlineCursorJumps: [
      { from: 73, to: 74 },
      { from: 74, to: 157 },
      { from: 157, to: 205 },
      { from: 205, to: 267 },
      { from: 267, to: 311 }
    ],
    firstLevelCursorJumps: [
      { from: 74, to: 75 },
      { from: 75, to: 89 },
      { from: 89, to: 133 },
      { from: 133, to: 157 },
      { from: 157, to: 158 },
      { from: 158, to: 178 },
      { from: 178, to: 185 },
      { from: 185, to: 194 },
      { from: 194, to: 198 },
      { from: 198, to: 205 },
      { from: 267, to: 268 },
      { from: 268, to: 311 }
    ],
    secondLevelCursorJumps: [
      { from: 162, to: 177 },
      { from: 186, to: 193 },
      { from: 199, to: 205 }
    ]
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

async function setCursor(editor, line, character = 0) {
  const focusedEditor = await vscode.window.showTextDocument(editor.document, {
    preview: false,
    preserveFocus: false,
    viewColumn: editor.viewColumn
  });
  await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  const position = new vscode.Position(line, character);
  const selection = new vscode.Selection(position, position);
  focusedEditor.selection = selection;
  focusedEditor.revealRange(new vscode.Range(position, position));
  await sleep(75);
  return focusedEditor;
}

async function waitForCursorDownResult(editor, startLine, expectedLine, label) {
  let lastActualLine = -1;
  try {
    await waitFor(async () => {
      const focusedEditor = await setCursor(editor, startLine);
      await vscode.commands.executeCommand("cursorDown");
      lastActualLine = (vscode.window.activeTextEditor || focusedEditor).selection.active.line;
      return lastActualLine === expectedLine;
    }, label);
  } catch (error) {
    throw new Error(`${error.message} Expected line ${expectedLine}, last actual ${lastActualLine}.`);
  }
}

async function assertCursorJumpSequence(editor, jumps, descriptionPrefix) {
  for (const jump of jumps) {
    const fromLine = Math.max(0, Number(jump?.from) || 0);
    const toLine = Math.max(0, Number(jump?.to) || 0);
    const label =
      jump?.label ||
      `${descriptionPrefix} should move from line ${fromLine + 1} to line ${toLine + 1}`;
    await waitForCursorDownResult(editor, fromLine, toLine, label);
  }
}

async function placeCursorAtDocumentEnd(editor) {
  const safeLastLine = Math.max(0, Number(editor?.document?.lineCount) - 1);
  return setCursor(editor, safeLastLine);
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
  const targetEditor =
    vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === document.uri.toString()) ||
    vscode.window.activeTextEditor;
  assert(targetEditor, `Expected a visible editor for ${path.basename(document.uri.fsPath)} after ${command}.`);
  await vscode.window.showTextDocument(targetEditor.document, {
    preview: false,
    preserveFocus: false,
    viewColumn: targetEditor.viewColumn
  });
  return vscode.window.activeTextEditor || targetEditor;
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

      test("foldDocumentationToHeadlines keeps only the expected headline steps visible in the editor", async () => {
        await placeCursorAtDocumentEnd(editor);
        await runFoldCommand("robotCompanion.foldDocumentationToHeadlines");
        await assertCursorJumpSequence(
          editor,
          scenario.headlineCursorJumps,
          "headline fold"
        );
      });

      test("foldDocumentationToHeadlines clears an existing owner fold before applying documentation folds", async () => {
        await createOwnerFold(editor, scenario.ownerLine);
        await placeCursorAtDocumentEnd(editor);
        await runFoldCommand("robotCompanion.foldDocumentationToHeadlines");
        await waitForCursorDownResult(
          editor,
          scenario.ownerLine,
          scenario.ownerLine + 1,
          "owner line should no longer stay collapsed after headline folding"
        );
        await assertCursorJumpSequence(editor, scenario.headlineCursorJumps, "headline fold after clearing owner fold");
      });

      test("foldDocumentationToFirstLevel keeps the expected first-level steps visible and hides their bodies", async () => {
        await placeCursorAtDocumentEnd(editor);
        await runFoldCommand("robotCompanion.foldDocumentationToFirstLevel");
        await assertCursorJumpSequence(
          editor,
          scenario.firstLevelCursorJumps,
          "first-level fold"
        );
      });

      test("foldDocumentationToFirstLevel clears an existing owner fold before applying documentation folds", async () => {
        await createOwnerFold(editor, scenario.ownerLine);
        await placeCursorAtDocumentEnd(editor);
        await runFoldCommand("robotCompanion.foldDocumentationToFirstLevel");
        await waitForCursorDownResult(
          editor,
          scenario.ownerLine,
          scenario.ownerLine + 1,
          "owner line should no longer stay collapsed after first-level folding"
        );
        await assertCursorJumpSequence(
          editor,
          scenario.firstLevelCursorJumps,
          "first-level fold after clearing owner fold"
        );
      });

      test("foldDocumentationToSecondLevel keeps only the expected nested steps collapsed", async () => {
        await placeCursorAtDocumentEnd(editor);
        await runFoldCommand("robotCompanion.foldDocumentationToSecondLevel");
        await assertCursorJumpSequence(
          editor,
          scenario.secondLevelCursorJumps,
          "second-level fold"
        );
      });

      test("unfoldDocumentation restores line-by-line cursor movement", async () => {
        await placeCursorAtDocumentEnd(editor);
        await runFoldCommand("robotCompanion.foldDocumentationToHeadlines");

        await runFoldCommand("robotCompanion.unfoldDocumentation");
        await sleep(250);

        const unfoldedProbeLines = Array.from(
          new Set(
            [
              ...scenario.headlineCursorJumps.map((jump) => jump.from),
              ...scenario.firstLevelCursorJumps.map((jump) => jump.from),
              ...scenario.secondLevelCursorJumps.map((jump) => jump.from)
            ].filter((line) => Number.isInteger(line))
          )
        );

        for (const line of unfoldedProbeLines) {
          await waitForCursorDownResult(
            editor,
            line,
            line + 1,
            `line ${line + 1} should move to the next physical line after unfold`
          );
        }
      });

      test("preview-targeted folding commands work even when a non-robot editor is active", async () => {
        await placeCursorAtDocumentEnd(editor);
        editor = await runPreviewFoldCommand("robotCompanion.foldDocumentationToHeadlines", document);
        await assertCursorJumpSequence(editor, scenario.headlineCursorJumps, "preview headline fold");

        await placeCursorAtDocumentEnd(editor);
        editor = await runPreviewFoldCommand("robotCompanion.foldDocumentationToFirstLevel", document);
        await assertCursorJumpSequence(editor, scenario.firstLevelCursorJumps, "preview first-level fold");

        await placeCursorAtDocumentEnd(editor);
        editor = await runPreviewFoldCommand("robotCompanion.foldDocumentationToSecondLevel", document);
        await assertCursorJumpSequence(editor, scenario.secondLevelCursorJumps, "preview second-level fold");

        await placeCursorAtDocumentEnd(editor);
        editor = await runPreviewFoldCommand("robotCompanion.unfoldDocumentation", document);
        await sleep(250);
        await waitForCursorDownResult(
          editor,
          scenario.headlineCursorJumps[0].from,
          scenario.headlineCursorJumps[0].from + 1,
          "preview unfold should restore line-by-line movement"
        );
      });
    });
  }
});
