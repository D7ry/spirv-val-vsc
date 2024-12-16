// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Create a diagnostic collection for SPIR-V
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('spirv');

  // Register event listeners for when documents are opened or saved
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      lintDocument(doc, diagnosticCollection);
    }),
    vscode.workspace.onDidSaveTextDocument(doc => {
      lintDocument(doc, diagnosticCollection);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnosticCollection.delete(doc.uri);
    })
  );

  // Trigger linting for the active document
  if (vscode.window.activeTextEditor) {
    lintDocument(vscode.window.activeTextEditor.document, diagnosticCollection);
  }

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "spirv-val-vsc" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('spirv-val-vsc.helloWorld', () => {
	//   // The code you place here will be executed every time your command is executed
	//   // Display a message box to the user
	//   vscode.window.showInformationMessage('Hello World from spirv-val-vsc!');
	// });

	// context.subscriptions.push(disposable);
}

/**
 * Lints a SPIR-V assembly document by invoking spirv-as and spirv-val.
 * @param document The text document to lint.
 * @param collection The diagnostic collection to update.
 */
function lintDocument(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  if (document.languageId !== 'spv-asm') {
    return;
  }

  const config = vscode.workspace.getConfiguration('spirv-val-vsc');
  const spirvAsPath = config.get<string>('spirvAsPath', 'spirv-as');
  const spirvValPath = config.get<string>('spirvValPath', 'spirv-val');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spirv-'));
  const tempFile = path.join(tempDir, 'temp.spv');

  // Assemble the SPIR-V assembly file
  cp.exec(
    `"${spirvAsPath}" --preserve-numeric-ids "${document.fileName}" -o "${tempFile}"`,
    (assembleErr, _, assembleStderr) => {
      if (assembleErr) {
        // Parse and display assembler errors
        console.log(assembleStderr);
        const diagnostics = parseErrors(assembleStderr, document, false);
        collection.set(document.uri, diagnostics);
        cleanUp(tempDir);
        return;
      }

      // Validate the assembled SPIR-V binary
      cp.exec(
        `"${spirvValPath}" "${tempFile}"`,
        (validateErr, _, validateStderr) => {
          const diagnostics = parseErrors(validateStderr, document, true);
          collection.set(document.uri, diagnostics);
          cleanUp(tempDir);
        }
      );
    }
  );
}

/**
 * Parses the error output from spirv-as or spirv-val and returns diagnostics.
 * @param stderr The standard error output string.
 * @param document The text document being linted.
 * @param adjustLineNumbers Whether to adjust line numbers for header comments.
 * @returns An array of diagnostics.
 */
function parseErrors(
  stderr: string,
  document: vscode.TextDocument,
  adjustLineNumbers: boolean
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const lines = stderr.split('\n');
  const regex = /error: line (\d+): (.+)/;

  // Count the number of header comments if needed
  const headerCommentCount = adjustLineNumbers
    ? document.getText().split('\n').filter(line => line.startsWith(';')).length
    : 0;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const lineNumber = parseInt(match[1], 10) - 1 + headerCommentCount;
      const message = match[2];
      const range = new vscode.Range(
        lineNumber,
        0,
        lineNumber,
        document.lineAt(lineNumber).text.length
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

/**
 * Cleans up temporary files and directories.
 * @param tempDir The temporary directory to remove.
 */
function cleanUp(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// This method is called when your extension is deactivated
export function deactivate() {}
