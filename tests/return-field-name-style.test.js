const assert = require("assert");
const Module = require("module");
const path = require("path");

function loadExtensionModule() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") {
      return {
        workspace: {
          getConfiguration: () => ({
            get: (_key, fallbackValue) => fallbackValue
          }),
          getWorkspaceFolder: () => undefined,
          workspaceFolders: [],
          onDidChangeConfiguration: () => ({ dispose() {} }),
          onDidOpenTextDocument: () => ({ dispose() {} }),
          onDidSaveTextDocument: () => ({ dispose() {} }),
          onDidCloseTextDocument: () => ({ dispose() {} }),
          onDidChangeTextDocument: () => ({ dispose() {} }),
          findFiles: async () => []
        },
        window: {
          createOutputChannel: () => ({
            appendLine() {},
            show() {},
            dispose() {}
          }),
          visibleTextEditors: [],
          activeTextEditor: undefined,
          onDidChangeActiveTextEditor: () => ({ dispose() {} }),
          showInformationMessage: async () => undefined,
          showWarningMessage: async () => undefined,
          showErrorMessage: async () => undefined
        },
        debug: {
          activeDebugSession: undefined,
          sessions: [],
          onDidStartDebugSession: () => ({ dispose() {} }),
          onDidTerminateDebugSession: () => ({ dispose() {} }),
          onDidChangeActiveDebugSession: () => ({ dispose() {} })
        },
        commands: {
          registerCommand: () => ({ dispose() {} }),
          executeCommand: async () => undefined
        },
        languages: {
          registerCodeLensProvider: () => ({ dispose() {} }),
          registerHoverProvider: () => ({ dispose() {} }),
          registerCompletionItemProvider: () => ({ dispose() {} })
        },
        EventEmitter: class {
          constructor() {
            this.event = () => undefined;
          }
          fire() {}
          dispose() {}
        },
        MarkdownString: class {
          appendMarkdown() {}
          appendText() {}
        },
        Range: class {},
        Position: class {},
        Hover: class {},
        CompletionItem: class {},
        CodeLens: class {},
        TreeItem: class {},
        ThemeIcon: class {},
        Selection: class {},
        CompletionItemKind: {
          Field: 5,
          Variable: 6,
          Value: 12,
          EnumMember: 20
        },
        TreeItemCollapsibleState: {
          None: 0,
          Collapsed: 1,
          Expanded: 2
        },
        Uri: {
          joinPath: (...parts) => ({
            fsPath: parts
              .map((part) => String(part?.fsPath || part?.path || part || ""))
              .filter(Boolean)
              .join(path.sep)
          })
        },
        Disposable: {
          from: (...disposables) => ({
            dispose() {
              for (const disposable of disposables) {
                disposable?.dispose?.();
              }
            }
          })
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require("../src/core/extension.js");
  } finally {
    Module._load = originalLoad;
  }
}

const extensionModule = loadExtensionModule();
const workerModule = require("../src/core/return-worker.js");
const extensionTestApi = extensionModule.__test__;
const workerTestApi = workerModule.__test__;

function createIndex(structuredTypes) {
  const structuredTypesByName = new Map();
  const moduleInfoByFile = new Map();
  for (const structuredType of structuredTypes) {
    const candidate = {
      name: structuredType.name,
      filePath: structuredType.filePath,
      modulePath: structuredType.modulePath,
      qualifiedName: structuredType.qualifiedName,
      isDataclass: structuredType.isDataclass !== false,
      isIndexableWrapper: Boolean(structuredType.isIndexableWrapper),
      supportsCamelCaseAccess: Boolean(structuredType.supportsCamelCaseAccess),
      baseTypeNames: structuredType.baseTypeNames || [],
      baseTypeRefs: structuredType.baseTypeRefs || [],
      fields: structuredType.fields || [],
      properties: structuredType.properties || []
    };
    const existing = structuredTypesByName.get(candidate.name) || [];
    existing.push(candidate);
    structuredTypesByName.set(candidate.name, existing);
    moduleInfoByFile.set(candidate.filePath, {
      modulePath: candidate.modulePath,
      packagePath: structuredType.packagePath || ""
    });
  }

  return {
    structuredTypesByName,
    structuredTypesByQualifiedName: new Map(),
    enumsByName: new Map(),
    enumsByQualifiedName: new Map(),
    moduleInfoByFile,
    localStructuredTypeNamesByFile: new Map(),
    localEnumNamesByFile: new Map(),
    typeImportAliasesByFile: new Map(),
    moduleImportAliasesByFile: new Map()
  };
}

function getOnlyStructuredType(types, name) {
  return types.filter((type) => type.name === name)[0];
}

function runPythonCamelCaseDetectionTests() {
  const source = `
class PlainBase:
    status_code: int

class CamelDirect(CamelCaseBase):
    status_code: int

class CamelChild(CamelDirect):
    business_key: str

class PlainChild(PlainBase):
    raw_field: str
`;
  const parsedTypes = extensionTestApi.parseStructuredTypesFromPythonSource(source, "/tmp/camel_detection.py");
  const structuredTypesByName = new Map();
  for (const parsedType of parsedTypes) {
    const existing = structuredTypesByName.get(parsedType.name) || [];
    existing.push({
      ...parsedType,
      modulePath: "tests.camel_detection",
      qualifiedName: `tests.camel_detection.${parsedType.name}`,
      baseTypeRefs: []
    });
    structuredTypesByName.set(parsedType.name, existing);
  }

  extensionTestApi.finalizeStructuredTypeCamelCaseAccess(structuredTypesByName);

  assert.strictEqual(getOnlyStructuredType(parsedTypes, "CamelDirect").supportsCamelCaseAccess, true);
  assert.strictEqual(structuredTypesByName.get("CamelChild")[0].supportsCamelCaseAccess, true);
  assert.strictEqual(structuredTypesByName.get("PlainBase")[0].supportsCamelCaseAccess, false);
  assert.strictEqual(structuredTypesByName.get("PlainChild")[0].supportsCamelCaseAccess, false);
}

function runPythonPropertyParsingTests() {
  const source = `
class PropertyOnly:
    @property
    def business_key(self) -> str | None:
        return None

    @property
    def process_definition_key(self) -> str | None:
        return self.business_key
`;
  const parsedTypes = extensionTestApi.parseStructuredTypesFromPythonSource(source, "/tmp/property_detection.py");
  const propertyOnly = getOnlyStructuredType(parsedTypes, "PropertyOnly");
  assert(propertyOnly);
  assert.deepStrictEqual(
    propertyOnly.properties.map((property) => property.name),
    ["business_key", "process_definition_key"]
  );
  assert.deepStrictEqual(
    propertyOnly.properties.map((property) => property.annotation),
    ["str | None", "str | None"]
  );
}

function runReturnFieldNameStyleTests() {
  const index = createIndex([
    {
      name: "CamelInheritedResponse",
      filePath: "/tmp/models/camel_inherited_response.py",
      modulePath: "tests.models.camel_inherited_response",
      qualifiedName: "tests.models.camel_inherited_response.CamelInheritedResponse",
      supportsCamelCaseAccess: true,
      baseTypeNames: ["InheritedPayload"],
      baseTypeRefs: [{ typeName: "InheritedPayload", preferredQualifiedNames: [] }],
      fields: []
    },
    {
      name: "InheritedPayload",
      filePath: "/tmp/models/inherited_payload.py",
      modulePath: "tests.models.inherited_payload",
      qualifiedName: "tests.models.inherited_payload.InheritedPayload",
      supportsCamelCaseAccess: false,
      fields: [{ name: "process_instance", annotation: "StatusPayload" }]
    },
    {
      name: "CamelResponse",
      filePath: "/tmp/models/camel_response.py",
      modulePath: "tests.models.camel_response",
      qualifiedName: "tests.models.camel_response.CamelResponse",
      supportsCamelCaseAccess: true,
      fields: [
        { name: "status_code", annotation: "StatusPayload" },
        { name: "plain_child", annotation: "PlainChild" }
      ]
    },
    {
      name: "StatusPayload",
      filePath: "/tmp/models/status_payload.py",
      modulePath: "tests.models.status_payload",
      qualifiedName: "tests.models.status_payload.StatusPayload",
      supportsCamelCaseAccess: true,
      fields: [{ name: "business_key", annotation: "str" }]
    },
    {
      name: "PlainChild",
      filePath: "/tmp/models/plain_child.py",
      modulePath: "tests.models.plain_child",
      qualifiedName: "tests.models.plain_child.PlainChild",
      supportsCamelCaseAccess: false,
      fields: [{ name: "raw_field", annotation: "str" }]
    },
    {
      name: "PlainResponse",
      filePath: "/tmp/models/plain_response.py",
      modulePath: "tests.models.plain_response",
      qualifiedName: "tests.models.plain_response.PlainResponse",
      supportsCamelCaseAccess: false,
      fields: [{ name: "status_code", annotation: "str" }]
    }
  ]);

  const camelTemplate = workerTestApi.buildSimpleReturnAccessTemplate(["CamelResponse"], index, {
    maxDepth: 2,
    maxFieldsPerType: 10
  });
  const camelOnly = workerTestApi.bindSimpleReturnAccessTemplate("${resp}", camelTemplate, "camelcase");
  assert(camelOnly.firstLevel.includes("${resp.StatusCode}"));
  assert(camelOnly.firstLevel.includes("${resp.PlainChild}"));
  assert(!camelOnly.firstLevel.includes("${resp.status_code}"));
  assert(camelOnly.secondLevel.includes("${resp.StatusCode.BusinessKey}"));
  assert(camelOnly.secondLevel.includes("${resp.PlainChild.raw_field}"));
  assert(!camelOnly.secondLevel.includes("${resp.PlainChild.RawField}"));

  const snakeOnly = workerTestApi.bindSimpleReturnAccessTemplate("${resp}", camelTemplate, "snake_case");
  assert(snakeOnly.firstLevel.includes("${resp.status_code}"));
  assert(snakeOnly.firstLevel.includes("${resp.plain_child}"));
  assert(snakeOnly.secondLevel.includes("${resp.status_code.business_key}"));
  assert(snakeOnly.secondLevel.includes("${resp.plain_child.raw_field}"));
  assert(!snakeOnly.secondLevel.includes("${resp.PlainChild.raw_field}"));

  const both = workerTestApi.bindSimpleReturnAccessTemplate("${resp}", camelTemplate, "both");
  assert(both.firstLevel.includes("${resp.StatusCode}"));
  assert(both.firstLevel.includes("${resp.status_code}"));
  assert(both.secondLevel.includes("${resp.StatusCode.BusinessKey}"));
  assert(both.secondLevel.includes("${resp.status_code.business_key}"));
  assert(both.secondLevel.includes("${resp.PlainChild.raw_field}"));
  assert(both.secondLevel.includes("${resp.plain_child.raw_field}"));
  assert(!both.secondLevel.includes("${resp.StatusCode.business_key}"));
  assert(!both.secondLevel.includes("${resp.status_code.BusinessKey}"));

  const plainTemplate = workerTestApi.buildSimpleReturnAccessTemplate(["PlainResponse"], index, {
    maxDepth: 1,
    maxFieldsPerType: 10
  });
  const plainCamelOnly = workerTestApi.bindSimpleReturnAccessTemplate("${plain}", plainTemplate, "camelcase");
  assert.deepStrictEqual(plainCamelOnly.firstLevel, ["${plain.status_code}"]);

  const inheritedCamelTemplate = workerTestApi.buildSimpleReturnAccessTemplate(["CamelInheritedResponse"], index, {
    maxDepth: 2,
    maxFieldsPerType: 10
  });
  const inheritedCamelOnly = workerTestApi.bindSimpleReturnAccessTemplate(
    "${wrapped}",
    inheritedCamelTemplate,
    "camelcase"
  );
  assert(inheritedCamelOnly.firstLevel.includes("${wrapped.ProcessInstance}"));
  assert(!inheritedCamelOnly.firstLevel.includes("${wrapped.process_instance}"));
  assert(inheritedCamelOnly.secondLevel.includes("${wrapped.ProcessInstance.BusinessKey}"));
}

function runPropertyInclusionTests() {
  const index = createIndex([
    {
      name: "PropertyPayload",
      filePath: "/tmp/models/property_payload.py",
      modulePath: "tests.models.property_payload",
      qualifiedName: "tests.models.property_payload.PropertyPayload",
      supportsCamelCaseAccess: true,
      fields: [{ name: "status_code", annotation: "str" }],
      properties: [
        { name: "business_key", annotation: "str" },
        { name: "businessKey", annotation: "str" }
      ]
    }
  ]);

  const withPropertiesTemplate = workerTestApi.buildSimpleReturnAccessTemplate(["PropertyPayload"], index, {
    maxDepth: 1,
    maxFieldsPerType: 10,
    includeProperties: true
  });
  const camelOnly = workerTestApi.bindSimpleReturnAccessTemplate(
    "${payload}",
    withPropertiesTemplate,
    "camelcase"
  );
  assert.deepStrictEqual(camelOnly.firstLevel, ["${payload.StatusCode}", "${payload.BusinessKey}"]);

  const snakeOnly = workerTestApi.bindSimpleReturnAccessTemplate(
    "${payload}",
    withPropertiesTemplate,
    "snake_case"
  );
  assert(snakeOnly.firstLevel.includes("${payload.status_code}"));
  assert(snakeOnly.firstLevel.includes("${payload.business_key}"));
  assert(snakeOnly.firstLevel.includes("${payload.businessKey}"));

  const withoutPropertiesTemplate = workerTestApi.buildSimpleReturnAccessTemplate(["PropertyPayload"], index, {
    maxDepth: 1,
    maxFieldsPerType: 10,
    includeProperties: false
  });
  const withoutProperties = workerTestApi.bindSimpleReturnAccessTemplate(
    "${payload}",
    withoutPropertiesTemplate,
    "camelcase"
  );
  assert.deepStrictEqual(withoutProperties.firstLevel, ["${payload.StatusCode}"]);

  const technicalWithProperties = workerTestApi.buildReturnStructureLines(
    ["PropertyPayload"],
    index,
    {
      maxDepth: 1,
      maxFieldsPerType: 10,
      includeProperties: true
    },
    "technical"
  );
  assert(technicalWithProperties.some((line) => line.includes(".business_key")));
  assert(technicalWithProperties.some((line) => line.includes(".businessKey")));

  const technicalWithoutProperties = workerTestApi.buildReturnStructureLines(
    ["PropertyPayload"],
    index,
    {
      maxDepth: 1,
      maxFieldsPerType: 10,
      includeProperties: false
    },
    "technical"
  );
  assert(!technicalWithoutProperties.some((line) => line.includes(".business_key")));
  assert(!technicalWithoutProperties.some((line) => line.includes(".businessKey")));

  const unlimitedIndex = createIndex([
    {
      name: "WidePayload",
      filePath: "/tmp/models/wide_payload.py",
      modulePath: "tests.models.wide_payload",
      qualifiedName: "tests.models.wide_payload.WidePayload",
      supportsCamelCaseAccess: false,
      fields: Array.from({ length: 13 }, (_, index) => ({
        name: `field_${index + 1}`,
        annotation: "str"
      }))
    }
  ]);
  const unlimitedTemplate = workerTestApi.buildSimpleReturnAccessTemplate(["WidePayload"], unlimitedIndex, {
    maxDepth: 1,
    maxFieldsPerType: 0
  });
  const unlimitedAccess = workerTestApi.bindSimpleReturnAccessTemplate(
    "${wide}",
    unlimitedTemplate,
    "snake_case"
  );
  assert.strictEqual(unlimitedAccess.firstLevel.length, 13);
}

function runCompletionMatchingTests() {
  const index = createIndex([
    {
      name: "CamelResponse",
      filePath: "/tmp/models/camel_response.py",
      modulePath: "tests.models.camel_response",
      qualifiedName: "tests.models.camel_response.CamelResponse",
      supportsCamelCaseAccess: true,
      fields: [{ name: "status_code", annotation: "StatusPayload" }]
    },
    {
      name: "StatusPayload",
      filePath: "/tmp/models/status_payload.py",
      modulePath: "tests.models.status_payload",
      qualifiedName: "tests.models.status_payload.StatusPayload",
      supportsCamelCaseAccess: true,
      fields: [{ name: "business_key", annotation: "str" }]
    }
  ]);

  const template = workerTestApi.buildSimpleReturnAccessTemplate(["CamelResponse"], index, {
    maxDepth: 2,
    maxFieldsPerType: 10
  });

  const camelPrefix = workerTestApi.collectReturnMemberCompletionCandidatesFromTemplate(
    template,
    [],
    "St",
    2,
    "camelcase"
  );
  assert(camelPrefix.some((candidate) => candidate.insertText === "StatusCode"));
  assert(!camelPrefix.some((candidate) => candidate.insertText === "status_code"));

  const rawPrefixStillMatchesCamel = workerTestApi.collectReturnMemberCompletionCandidatesFromTemplate(
    template,
    [],
    "status_",
    2,
    "camelcase"
  );
  assert.deepStrictEqual(
    rawPrefixStillMatchesCamel.map((candidate) => candidate.insertText),
    ["StatusCode"]
  );

  const bothPrefix = workerTestApi.collectReturnMemberCompletionCandidatesFromTemplate(
    template,
    [],
    "St",
    2,
    "both"
  );
  assert(bothPrefix.some((candidate) => candidate.insertText === "StatusCode"));
  assert(bothPrefix.some((candidate) => candidate.insertText === "status_code"));

  const nestedFromCamelPath = workerTestApi.collectReturnMemberCompletionCandidatesFromTemplate(
    template,
    ["StatusCode"],
    "Bus",
    2,
    "camelcase"
  );
  assert.deepStrictEqual(
    nestedFromCamelPath.map((candidate) => candidate.insertText),
    ["BusinessKey"]
  );

  const nestedFromRawPath = workerTestApi.collectReturnMemberCompletionCandidatesFromTemplate(
    template,
    ["status_code"],
    "business_",
    2,
    "camelcase"
  );
  assert.deepStrictEqual(
    nestedFromRawPath.map((candidate) => candidate.insertText),
    ["BusinessKey"]
  );

  const propertyIndex = createIndex([
    {
      name: "PropertyPayload",
      filePath: "/tmp/models/property_payload.py",
      modulePath: "tests.models.property_payload",
      qualifiedName: "tests.models.property_payload.PropertyPayload",
      supportsCamelCaseAccess: true,
      fields: [{ name: "status_code", annotation: "str" }],
      properties: [
        { name: "business_key", annotation: "str" },
        { name: "businessKey", annotation: "str" }
      ]
    }
  ]);

  const propertyTemplate = workerTestApi.buildSimpleReturnAccessTemplate(["PropertyPayload"], propertyIndex, {
    maxDepth: 1,
    maxFieldsPerType: 10,
    includeProperties: true
  });
  const propertyPrefix = workerTestApi.collectReturnMemberCompletionCandidatesFromTemplate(
    propertyTemplate,
    [],
    "business",
    1,
    "camelcase"
  );
  assert.deepStrictEqual(
    propertyPrefix.map((candidate) => candidate.insertText),
    ["BusinessKey"]
  );

  const propertyPrefixSnake = workerTestApi.collectReturnMemberCompletionCandidatesFromTemplate(
    propertyTemplate,
    [],
    "business",
    1,
    "snake_case"
  );
  assert.deepStrictEqual(
    propertyPrefixSnake.map((candidate) => candidate.insertText),
    ["business_key", "businessKey"]
  );
}

runPythonCamelCaseDetectionTests();
runPythonPropertyParsingTests();
runReturnFieldNameStyleTests();
runPropertyInclusionTests();
runCompletionMatchingTests();
console.log("return-field-name-style tests passed");
